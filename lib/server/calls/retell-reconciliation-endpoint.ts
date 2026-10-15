export async function handleRetellReconciliationRequest(
  request: Request,
  reconcile: () => Promise<Response>,
): Promise<Response> {
  if (new URL(request.url).searchParams.get("dryRun") === "true") {
    return Response.json(
      {
        mode: "dry-run",
        dryRun: true,
        claimed: 0,
        reconciled: 0,
        duplicates: 0,
        deferred: 0,
        message:
          "Dry-run mode: no pending entries were inspected or changed, and no Retell API requests were made.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return reconcile();
}
