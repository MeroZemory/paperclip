import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EntityRow } from "../components/EntityRow";
import { StatusBadge } from "../components/StatusBadge";
import { MembershipAction } from "../components/MembershipAction";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatDate, projectUrl } from "../lib/utils";
import {
  resourceMembershipState,
  useResourceMembershipMutation,
  useResourceMemberships,
} from "../hooks/useResourceMemberships";
import { Button } from "@/components/ui/button";
import { Hexagon, Plus } from "lucide-react";

export function Projects() {
  const { selectedCompanyId } = useCompany();
  const { openNewProject } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Projects" }]);
  }, [setBreadcrumbs]);

  const { data: allProjects, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const membershipsQuery = useResourceMemberships(selectedCompanyId);
  const membershipMutation = useResourceMembershipMutation(selectedCompanyId);
  const projects = useMemo(
    () => (allProjects ?? []).filter((p) => !p.archivedAt),
    [allProjects],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={Hexagon} message="Select a company to view projects." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" variant="outline" onClick={openNewProject}>
          <Plus className="h-4 w-4 mr-1" />
          Add Project
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!isLoading && projects.length === 0 && (
        <EmptyState
          icon={Hexagon}
          message="No projects yet."
          action="Add Project"
          onAction={openNewProject}
        />
      )}

      {projects.length > 0 && (
        <div className="border border-border">
          {projects.map((project) => (
            (() => {
              const state = resourceMembershipState(membershipsQuery.data, "project", project.id);
              const pending = membershipMutation.isPending &&
                membershipMutation.variables?.resourceType === "project" &&
                membershipMutation.variables.resourceId === project.id;
              return (
                <EntityRow
                  key={project.id}
                  title={project.name}
                  subtitle={project.description ?? undefined}
                  to={projectUrl(project)}
                  className={state === "left" ? "group text-foreground/55" : "group"}
                  trailing={
                    <div className="flex items-center gap-3">
                      {project.targetDate && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(project.targetDate)}
                        </span>
                      )}
                      <StatusBadge status={project.status} />
                      <MembershipAction
                        state={state}
                        pending={pending}
                        pendingState={pending ? membershipMutation.variables?.state : null}
                        resourceName={project.name}
                        onJoin={() => membershipMutation.mutate({
                          resourceType: "project",
                          resourceId: project.id,
                          resourceName: project.name,
                          state: "joined",
                        })}
                        onLeave={() => membershipMutation.mutate({
                          resourceType: "project",
                          resourceId: project.id,
                          resourceName: project.name,
                          state: "left",
                        })}
                      />
                    </div>
                  }
                />
              );
            })()
          ))}
        </div>
      )}
    </div>
  );
}
