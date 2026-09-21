import { makeAuthModule } from "../../auth";

export const adminAuthModule = makeAuthModule({ label: "ADMIN", kind: "admin", prefix: "/admin/auth" });
