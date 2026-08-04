import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  accentClassName,
  footnote,
}: {
  label: string;
  value: number;
  accentClassName?: string;
  footnote?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("text-3xl font-semibold tracking-tight", accentClassName)}>
          {formatCount(value)}
        </p>
        {footnote ? <p className="mt-1 text-xs text-muted-foreground">{footnote}</p> : null}
      </CardContent>
    </Card>
  );
}
