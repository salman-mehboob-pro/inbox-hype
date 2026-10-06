"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["analytics", "activity", "sequence", "leads", "schedule", "options"] as const;

// Tabs kept in the URL (?tab=leads) so refresh / back keeps your place.
export function CampaignTabs({
  tab,
  leadsCount,
  stepsCount,
  analytics,
  activity,
  sequence,
  leads,
  schedule,
  options,
}: {
  tab: string;
  leadsCount: number;
  stepsCount: number;
  analytics: React.ReactNode;
  activity: React.ReactNode;
  sequence: React.ReactNode;
  leads: React.ReactNode;
  schedule: React.ReactNode;
  options: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = (TABS as readonly string[]).includes(tab) ? tab : "sequence";

  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        // Changing tab resets paging; filters of other tabs are dropped.
        const sp = new URLSearchParams();
        sp.set("tab", String(v));
        if (v === "activity") {
          for (const k of ["aq", "adate", "atype", "astep"]) {
            const val = searchParams.get(k);
            if (val) sp.set(k, val);
          }
        }
        router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
      }}
    >
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="sequence">Sequence ({stepsCount})</TabsTrigger>
          <TabsTrigger value="leads">Leads ({leadsCount.toLocaleString()})</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="analytics" className="pt-2">
        {analytics}
      </TabsContent>
      <TabsContent value="activity" className="pt-2">
        {activity}
      </TabsContent>
      <TabsContent value="sequence" className="pt-2">
        {sequence}
      </TabsContent>
      <TabsContent value="leads" className="pt-2">
        {leads}
      </TabsContent>
      <TabsContent value="schedule" className="pt-2">
        {schedule}
      </TabsContent>
      <TabsContent value="options" className="pt-2">
        {options}
      </TabsContent>
    </Tabs>
  );
}
