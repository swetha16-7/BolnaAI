import { NextResponse } from "next/server.js";
import { prisma } from "../../../../lib/server/db.ts";
import {
  verifyCalcomSignature,
  extractCalcomIdentifiers,
  processCalcomCancellation,
} from "../../../../lib/server/booking/service.ts";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-cal-signature-256") ||
      req.headers.get("x-cal-secret") ||
      req.headers.get("x-calcom-signature") ||
      req.headers.get("cal-signature-256") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

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

    const extracted = extractCalcomIdentifiers(payload);
    const booking = payload.payload || payload.data || payload.booking || payload;
    const bookingUid = extracted.primaryUid;

    const url = new URL(req.url);
    const tenantOrgId =
      url.searchParams.get("organizationId") ||
      url.searchParams.get("orgId") ||
      req.headers.get("x-organization-id") ||
      req.headers.get("x-tenant-id") ||
      undefined;

    // 0. PING / TEST EVENT
    if (extracted.isPing) {
      return NextResponse.json({
        received: true,
        status: "ok",
        event: "PING",
        message: "Cal.com webhook ping test received successfully.",
      });
    }

    if (!bookingUid) {
      return NextResponse.json(
        { error: "Missing Cal.com booking identifier in webhook payload." },
        { status: 400 },
      );
    }

    // 1. CANCELLATION / REJECTION
    if (extracted.isCancellation) {
      const result = await processCalcomCancellation(
        {
          rawBody,
          payload,
          headers: req.headers,
          secret: configuredSecret,
          bookingUid,
          organizationId: tenantOrgId,
        },
        { db: prisma },
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error, bookingUid: result.bookingUid },
          { status: result.statusCode },
        );
      }

      return NextResponse.json({
        received: true,
        action: result.action,
        appointmentId: result.appointmentId,
        bookingUid: result.bookingUid,
        status: "cancelled",
        message: result.message,
      });
    }

    // 2. RESCHEDULING
    const triggerEvent = extracted.triggerEvent.toUpperCase();
    if (triggerEvent.includes("RESCHEDULE")) {
      const orgFilter = tenantOrgId ? { organizationId: tenantOrgId } : {};
      const existingAppt = await prisma.appointment.findFirst({
        where: {
          ...orgFilter,
          OR: [
            { calcomEventId: { in: extracted.candidateIds } },
            { id: { in: extracted.candidateIds }, provider: "calcom" },
          ],
        },
        include: { contact: true },
      });

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

        return NextResponse.json({
          received: true,
          action: "rescheduled",
          appointmentId: existingAppt.id,
        });
      }

      return NextResponse.json(
        { error: `No appointment found to reschedule for booking identifier '${bookingUid}'.` },
        { status: 404 },
      );
    }

    // 3. BOOKING CREATED (Default)
    const existingAppt = await prisma.appointment.findFirst({
      where: {
        OR: [
          { calcomEventId: { in: extracted.candidateIds } },
          { id: { in: extracted.candidateIds } },
        ],
      },
    });

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

    const attendee =
      Array.isArray(booking.attendees) && booking.attendees.length > 0
        ? booking.attendees[0]
        : {};
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
    const endsAt = booking.endTime
      ? new Date(booking.endTime)
      : new Date(startsAt.getTime() + 60 * 60 * 1000);

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
          bookingUid: bookingUid,
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
