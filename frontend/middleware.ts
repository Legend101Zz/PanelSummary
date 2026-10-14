import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// /dev/components is the component gallery. It is for development only: a production build answers 404 (#94).
// The page calls notFound() too, but a streamed page has sent its status (200) before notFound() runs, so the status is set here.
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.rewrite(new URL("/_not-found-dev-gallery", request.url), { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dev/:path*"] };
