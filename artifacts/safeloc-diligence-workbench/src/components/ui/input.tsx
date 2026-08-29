import { forwardRef, type ComponentProps } from "react";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  ({ className = "", type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-[#87939a] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#255bb7] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";