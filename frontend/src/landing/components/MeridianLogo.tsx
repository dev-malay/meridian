export function MeridianLogo({ size = 24 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ fontSize: size, lineHeight: 1, fontWeight: 700 }}
    >
      ✱
    </span>
  );
}
