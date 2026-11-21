import type { ComponentProps } from "react";
import { Music2 } from "lucide-react";

type SpotifyIconProps = ComponentProps<typeof Music2>;

/** Generic music glyph; no third-party brand mark is shipped. */
export default function SpotifyIcon(props: SpotifyIconProps) {
    return <Music2 {...props} />;
}
