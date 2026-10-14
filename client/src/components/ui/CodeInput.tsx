// The 6-digit code field: digits only, wide letter spacing, mobile number keypad.
import Input from "./Input";

interface Props {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export default function CodeInput({ value, onChange, error }: Props) {
  return (
    <Input
      label="6-digit code"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="000000"
      inputClassName="text-center font-mono text-lg tracking-[0.5em]"
      error={error}
    />
  );
}
