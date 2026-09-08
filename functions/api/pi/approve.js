export async function onRequestPost(context) {
  try {
    const { paymentId } = await context.request.json();

    if (!paymentId) {
      return Response.json(
        { ok: false, error: "Missing paymentId" },
        { status: 400 }
      );
    }

    const apiKey = context.env.PI_API_KEY;

    if (!apiKey) {
      return Response.json(
        { ok: false, error: "Missing PI_API_KEY" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/approve`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`
        }
      }
    );

    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json"
      }
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "Approval request failed" },
      { status: 500 }
    );
  }
}
