import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import {
  ADMIN_RESOURCES,
  isAdminResource,
  listAdminResource,
} from "@/lib/admin-resources";

type Params = { params: Promise<{ resource: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { resource } = await params;

    if (!isAdminResource(resource)) {
      return apiError(
        `Unknown admin resource "${resource}"`,
        404,
        { available: Object.keys(ADMIN_RESOURCES) }
      );
    }

    const { searchParams } = new URL(request.url);

    const filters: Record<string, string> = {};
    for (const field of ADMIN_RESOURCES[resource].filterableFields ?? []) {
      const value = searchParams.get(field);
      if (value) filters[field] = value;
    }

    const result = await listAdminResource(resource, {
      page: Number(searchParams.get("page")) || 1,
      pageSize: Number(searchParams.get("pageSize")) || 20,
      search: searchParams.get("search") ?? undefined,
      filters,
    });

    return apiSuccess({ resource, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
