import type { ComponentProps } from "react";
import { Tv } from "lucide-react";

type TwitchIconProps = ComponentProps<typeof Tv>;

/** Generic streaming glyph; no third-party brand mark is shipped. */
export default function TwitchIcon(props: TwitchIconProps) {
    return <Tv {...props} />;
}
