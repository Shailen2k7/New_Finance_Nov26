import { LogOut, UserRound } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AccountCard({ userName }: { userName: string }) {
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-muted" /> Your session</span>} subtitle="Changes you make are recorded under this name." />
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[14px] font-medium text-ink">{userName}</p>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="outline"><LogOut className="h-4 w-4" /> Log out</Button>
        </form>
      </div>
    </Card>
  );
}
