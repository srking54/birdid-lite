export async function onRequestPost(context) {
  try {
    const { accessToken } = await context.request.json();

    if (!accessToken) {
      return Response.json(
        { ok: false, error: "Missing accessToken" },
        { status: 400 }
      );
    }

    const response = await fetch("https://api.minepi.com/v2/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json"
      }
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "User verification failed" },
      { status: 500 }
    );
  }
}
