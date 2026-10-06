"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DashboardDay } from "./stats";

const config = {
  sent: { label: "Sent", color: "#0ea5e9" },
  opened: { label: "Opened", color: "#8b5cf6" },
  replied: { label: "Replies", color: "#10b981" },
} satisfies ChartConfig;

// "2026-10-06" -> "Oct 6". Read as plain numbers so the time zone never shifts the day.
function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function ActivityChart({ data, showOpens }: { data: DashboardDay[]; showOpens: boolean }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={dayLabel}
        />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => dayLabel(String(value))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area dataKey="sent" type="monotone" stroke="var(--color-sent)" fill="var(--color-sent)" fillOpacity={0.15} strokeWidth={2} />
        {showOpens && (
          <Area dataKey="opened" type="monotone" stroke="var(--color-opened)" fill="var(--color-opened)" fillOpacity={0.1} strokeWidth={2} />
        )}
        <Area dataKey="replied" type="monotone" stroke="var(--color-replied)" fill="var(--color-replied)" fillOpacity={0.2} strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}
