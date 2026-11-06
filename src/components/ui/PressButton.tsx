import { motion, type HTMLMotionProps } from "motion/react";
import { press } from "../../motion/variants";

type Variant = "primary" | "secondary" | "quiet" | "go";
type Size = "l" | "m" | "s";

type PressButtonProps = HTMLMotionProps<"button"> & {
  variant?: Variant;
  size?: Size;
  wide?: boolean;
};

export function PressButton({ variant = "secondary", size = "m", wide, className, type = "button", disabled, ...rest }: PressButtonProps) {
  const classes = ["pbtn", `pbtn-${variant}`, `pbtn-${size}`, wide ? "pbtn-wide" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <motion.button
      type={type}
      className={classes}
      disabled={disabled}
      whileTap={disabled ? undefined : press.whileTap}
      transition={press.transition}
      {...rest}
    />
  );
}
