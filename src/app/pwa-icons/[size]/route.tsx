import { ImageResponse } from "next/og";

type Params = { params: Promise<{ size: string }> };

export async function GET(request: Request, { params }: Params) {
  const { size: raw } = await params;
  const size = raw === "512" ? 512 : 192;
  const origin = new URL(request.url).origin;
  const logo = `${origin}/reaper_logo.svg`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          width={Math.round(size * 0.72)}
          height={Math.round(size * 0.72)}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
