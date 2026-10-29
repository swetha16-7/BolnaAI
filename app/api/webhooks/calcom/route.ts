import { NextResponse } from "next/server.js";
import crypto from "node:crypto";
import { prisma } from "../../../../lib/server/db.ts";
import { timingSafeSecretEqual } from "../../../../lib/server/booking/service.ts";

function verifyCalcomSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!secret) return true; // If no secret configured, fail-open or allow
  if (!signatureHeader) return false;

  // Header may be raw secret or HMAC sha256
  if (timingSafeSecretEqual(signatureHeader, secret)) {
    return true;
  }

  try {
    const hmac = crypto.createHmac("sha256", secret.trim());
    const expected = hmac.update(rawBody).digest("hex");
    return timingSafeSecretEqual(signatureHeader, expected);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-cal-signature-256") || req.headers.get("x-cal-secret");
    const configuredSecret = process.env.CALCOM_WEBHOOK_SECRET?.trim();

    if (configuredSecret && !verifyCalcomSignature(rawBody, signature, configuredSecret)) {
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
    }

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const triggerEvent = String(payload.triggerEvent || payload.event || "").toUpperCase();
    const booking = payload.payload || payload.data || payload;
    const bookingUid = String(booking.uid || booking.id || "");

    if (!bookingUid) {
      return NextResponse.json({ error: "Missing booking UID." }, { status: 400 });
    }

    const existingAppt = await prisma.appointment.findFirst({
      where: { calcomEventId: bookingUid },
      include: { contact: true },
    });

    if (triggerEvent.includes("CANCEL") || triggerEvent.includes("REJECT")) {
      if (existingAppt) {
        await prisma.appointment.update({
          where: { id: existingAppt.id },
          data: { status: "cancelled" },
        });

        await prisma.auditLog.create({
          data: {
            organizationId: existingAppt.organizationId,
            entity: "appointment",
            action: "calcom_webhook_cancel",
            details: {
              appointmentId: existingAppt.id,
              calcomBookingUid: bookingUid,
              triggerEvent,
            },
          },
        });
      }
      return NextResponse.json({ received: true, action: "cancelled", appointmentId: existingAppt?.id ?? null });
    }

    if (triggerEvent.includes("RESCHEDULE")) {
      if (existingAppt) {
        const startsAt = booking.startTime ? new Date(booking.startTime) : existingAppt.startsAt;
        const endsAt = booking.endTime ? new Date(booking.endTime) : existingAppt.endsAt;

        await prisma.appointment.update({
          where: { id: existingAppt.id },
          data: {
            startsAt,
            endsAt,
            status: "confirmed",
          },
        });

        await prisma.auditLog.create({
          data: {
            organizationId: existingAppt.organizationId,
            entity: "appointment",
            action: "calcom_webhook_reschedule",
            details: {
              appointmentId: existingAppt.id,
              calcomBookingUid: bookingUid,
              newStartsAt: startsAt.toISOString(),
              triggerEvent,
            },
          },
        });
      }
      return NextResponse.json({ received: true, action: "rescheduled", appointmentId: existingAppt?.id ?? null });
    }

    // Default: BOOKING_CREATED
    if (existingAppt) {
      // Prevent duplicate creation
      return NextResponse.json({
        received: true,
        action: "already_exists",
        appointmentId: existingAppt.id,
      });
    }

    // If appointment not yet recorded, insert it
    const defaultOrg = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!defaultOrg) {
      return NextResponse.json({ error: "No organization found." }, { status: 500 });
    }

    const attendee = Array.isArray(booking.attendees) && booking.attendees.length > 0 ? booking.attendees[0] : {};
    const attendeeName = attendee.name || booking.title || "Customer";
    const attendeeEmail = attendee.email || null;
    const attendeePhone = attendee.phoneNumber || null;

    let contact = null;
    if (attendeePhone || attendeeEmail) {
      contact = await prisma.contact.findFirst({
        where: {
          organizationId: defaultOrg.id,
          OR: [
            ...(attendeePhone ? [{ phone: attendeePhone }] : []),
            ...(attendeeEmail ? [{ email: attendeeEmail }] : []),
          ],
        },
      });
    }

    if (!contact) {
      const nameParts = String(attendeeName).trim().split(" ");
      contact = await prisma.contact.create({
        data: {
          organizationId: defaultOrg.id,
          firstName: nameParts[0] || "Customer",
          lastName: nameParts.slice(1).join(" ") || null,
          email: attendeeEmail,
          phone: attendeePhone,
          source: "Cal.com Webhook",
          status: "qualified",
        },
      });
    }

    const startsAt = booking.startTime ? new Date(booking.startTime) : new Date();
    const endsAt = booking.endTime ? new Date(booking.endTime) : new Date(startsAt.getTime() + 60 * 60 * 1000);

    const newAppt = await prisma.appointment.create({
      data: {
        organizationId: defaultOrg.id,
        contactId: contact.id,
        status: "confirmed",
        startsAt,
        endsAt,
        timezone: booking.timeZone || "Asia/Kolkata",
        serviceName: booking.title || "Property Viewing",
        provider: "calcom",
        calcomEventId: bookingUid,
        metadata: {
          customerName: attendeeName,
          email: attendeeEmail,
          phoneNumber: attendeePhone,
          calcomBookingUid: bookingUid,
          source: "calcom_webhook",
        },
      },
    });

    return NextResponse.json({
      received: true,
      action: "created",
      appointmentId: newAppt.id,
    });
  } catch (error: any) {
    console.error("Cal.com webhook error:", error?.message);
    return NextResponse.json({ error: "Webhook processing error." }, { status: 500 });
  }
}
