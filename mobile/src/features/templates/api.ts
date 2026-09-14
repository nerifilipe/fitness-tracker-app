import type { components } from "../../services/api/schema";
import type { AuthSession } from "../auth/session";

export type Template = components["schemas"]["TemplateResponse"];
export type TemplateSummary = components["schemas"]["TemplateSummary"];
export type TemplateInput = components["schemas"]["TemplateInput"];
export type TemplatePage = components["schemas"]["TemplatePage"];

export function templateApi(session: AuthSession) {
  return {
    list: (offset = 0, signal?: AbortSignal) =>
      session.authorized<TemplatePage>(
        `/workout-templates?offset=${offset}&limit=20`,
        { signal },
      ),
    detail: (id: string, signal?: AbortSignal) =>
      session.authorized<Template>(`/workout-templates/${id}`, { signal }),
    create: (data: TemplateInput) =>
      session.authorized<Template>("/workout-templates", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, version: number, data: TemplateInput) =>
      session.authorized<Template>(`/workout-templates/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ...data, version }),
      }),
    duplicate: (id: string) =>
      session.authorized<Template>(`/workout-templates/${id}/duplicate`, {
        method: "POST",
      }),
    archive: (id: string, version: number) =>
      session.authorized<void>(`/workout-templates/${id}?version=${version}`, {
        method: "DELETE",
      }),
  };
}
