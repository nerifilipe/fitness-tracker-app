import type { components } from "../../services/api/schema";

export type User = components["schemas"]["UserResponse"];
export type Tokens = components["schemas"]["TokenResponse"];
export type LoginInput = components["schemas"]["LoginRequest"];
export type RegisterInput = components["schemas"]["RegisterRequest"];
export type ProfileInput = components["schemas"]["ProfileUpdate"];
