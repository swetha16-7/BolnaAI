"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Plus } from "lucide-react";

export const TeamsView: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Teams"
        description="Manage team members and collaborate on voice agent campaigns"
      >
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="mr-2 h-4 w-4" />
          Add Team Member
        </Button>
      </PageHeader>

      <Card className="border-border/60">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Users className="h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-semibold">No teams yet</h3>
            <p className="text-sm text-muted-foreground">Create your first team to collaborate with team members</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamsView;
