export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface DocParam {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
}

export interface EndpointRecord {
  id: string;
  title: string;
  method: HttpMethod;
  path: string;
  authRequired: boolean;
  pathParams: DocParam[];
  queryParams: DocParam[];
  bodyParams: DocParam[];
  responseExample?: unknown;
  docsAnchor: string;
}

export interface ScopeCatalog {
  id: string;
  title: string;
  endpoints: EndpointRecord[];
}

export interface DocsCatalog {
  generatedAt: string;
  scopes: ScopeCatalog[];
}
