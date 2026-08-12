import { ImageResponse } from "next/og";

type Params = { params: Promise<{ size: string }> };

export async function GET(request: Request, { params }: Params) {
  const { size: raw } = await params;
  const size = raw === "512" ? 512 : 192;
  const origin = new URL(request.url).origin;
  const logo = `${origin}/reaper_logo.svg`;
  // Maskable (Android adaptive) icons need an opaque safe-zone background.
  const maskable = new URL(request.url).searchParams.get("maskable") === "1";
  const logoScale = maskable ? 0.72 : 0.88;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? "#111111" : "transparent",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          width={Math.round(size * logoScale)}
          height={Math.round(size * logoScale)}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
