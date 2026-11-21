import type { ComponentProps } from "react";
import { Radio } from "lucide-react";

type KickIconProps = ComponentProps<typeof Radio>;

/** Generic streaming glyph; no third-party brand mark is shipped. */
export default function KickIcon(props: KickIconProps) {
    return <Radio {...props} />;
}
