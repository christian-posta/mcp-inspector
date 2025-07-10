import { OAuthStep, AuthDebuggerState } from "./auth-types";
import { DebugInspectorOAuthClientProvider } from "./auth";
import {
  discoverOAuthMetadata,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
  discoverOAuthProtectedResourceMetadata,
  selectResourceURL,
} from "@modelcontextprotocol/sdk/client/auth.js";
import {
  OAuthMetadataSchema,
  OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";

// Helper function to show debug info in UI
function showDebugInfo(title: string, data: any) {
  // Store in localStorage for persistence across redirects
  const debugKey = `mcp_inspector_debug_${Date.now()}`;
  localStorage.setItem(debugKey, JSON.stringify({
    title,
    data,
    timestamp: new Date().toISOString()
  }));
  
  // Also log to console
  console.log(`📋 ${title}:`, data);
  
  // Show a toast notification (if available)
  if (typeof window !== 'undefined' && window.showDebugToast) {
    window.showDebugToast(title, data);
  }
}

// Add a global function to show debug toasts
declare global {
  interface Window {
    showDebugToast?: (title: string, data: any) => void;
    showMCPInspectorDebug?: () => void;
  }
}

// Global function to show all stored debug info
window.showMCPInspectorDebug = function() {
  console.log("🔍 MCP Inspector Debug Info:");
  console.log("================================");
  
  // Get all debug keys from localStorage
  const debugKeys = Object.keys(localStorage).filter(key => 
    key.startsWith('mcp_inspector_debug_')
  );
  
  if (debugKeys.length === 0) {
    console.log("No debug info found in localStorage");
    return;
  }
  
  debugKeys.forEach(key => {
    try {
      const debugData = JSON.parse(localStorage.getItem(key) || '{}');
      console.log(`📋 ${debugData.title || key}:`, debugData.data);
      console.log("---");
    } catch (error) {
      console.log(`Error parsing debug data for ${key}:`, error);
    }
  });
  
  // Also check sessionStorage
  const clientRegDebug = sessionStorage.getItem("mcp_inspector_debug_client_registration");
  const authDebug = sessionStorage.getItem("mcp_inspector_debug_authorization");
  
  if (clientRegDebug) {
    console.log("📋 Client Registration Debug (sessionStorage):", JSON.parse(clientRegDebug));
  }
  
  if (authDebug) {
    console.log("📋 Authorization Debug (sessionStorage):", JSON.parse(authDebug));
  }
};

export interface StateMachineContext {
  state: AuthDebuggerState;
  serverUrl: string;
  provider: DebugInspectorOAuthClientProvider;
  updateState: (updates: Partial<AuthDebuggerState>) => void;
}

export interface StateTransition {
  canTransition: (context: StateMachineContext) => Promise<boolean>;
  execute: (context: StateMachineContext) => Promise<void>;
}

// State machine transitions
export const oauthTransitions: Record<OAuthStep, StateTransition> = {
  metadata_discovery: {
    canTransition: async () => true,
    execute: async (context) => {
      console.log("🚀 Starting metadata_discovery step");
      
      // Default to discovering from the server's URL
      let authServerUrl = new URL("/", context.serverUrl);
      let resourceMetadata: OAuthProtectedResourceMetadata | null = null;
      let resourceMetadataError: Error | null = null;
      try {
        console.log("🔍 Fetching protected resource metadata from:", context.serverUrl);
        resourceMetadata = await discoverOAuthProtectedResourceMetadata(
          context.serverUrl,
        );
        console.log("✅ Protected resource metadata received:", resourceMetadata);
        if (resourceMetadata?.authorization_servers?.length) {
          authServerUrl = new URL(resourceMetadata.authorization_servers[0]);
          console.log("🎯 Using authorization server:", authServerUrl.toString());
        }
      } catch (e) {
        console.log("❌ Error fetching protected resource metadata:", e);
        if (e instanceof Error) {
          resourceMetadataError = e;
        } else {
          resourceMetadataError = new Error(String(e));
        }
      }

      const resource: URL | undefined = await selectResourceURL(
        context.serverUrl,
        context.provider,
        // we default to null, so swap it for undefined if not set
        resourceMetadata ?? undefined,
      );

      console.log("🔍 Fetching OAuth metadata from:", authServerUrl.toString());
      const metadata = await discoverOAuthMetadata(authServerUrl);
      if (!metadata) {
        throw new Error("Failed to discover OAuth metadata");
      }
      console.log("✅ OAuth metadata received:", metadata);
      const parsedMetadata = await OAuthMetadataSchema.parseAsync(metadata);
      context.provider.saveServerMetadata(parsedMetadata);
      context.updateState({
        resourceMetadata,
        resource,
        resourceMetadataError,
        authServerUrl,
        oauthMetadata: parsedMetadata,
        oauthStep: "client_registration",
      });
      console.log("✅ metadata_discovery step completed, moving to client_registration");
    },
  },

  client_registration: {
    canTransition: async (context) => !!context.state.oauthMetadata,
    execute: async (context) => {
      console.log("🚀 Starting client_registration step");
      
      const metadata = context.state.oauthMetadata!;
      const clientMetadata = context.provider.clientMetadata;

      // Debug: Log what metadata we have
      console.log("🔍 Client Registration Debug:");
      console.log("  - Resource metadata:", context.state.resourceMetadata);
      console.log("  - Auth server metadata:", metadata);
      console.log("  - Resource scopes_supported:", context.state.resourceMetadata?.scopes_supported);
      console.log("  - Auth server scopes_supported:", metadata.scopes_supported);

      // Prefer scopes from resource metadata if available
      const scopesSupported =
        context.state.resourceMetadata?.scopes_supported ||
        metadata.scopes_supported;
      
      // Debug: Log which scopes we're using
      console.log("  - Final scopes_supported:", scopesSupported);
      
      // Add all supported scopes to client registration
      if (scopesSupported) {
        clientMetadata.scope = scopesSupported.join(" ");
        console.log("  - Client registration scope:", clientMetadata.scope);
      } else {
        console.log("  - ⚠️ No scopes found! Using empty scope.");
      }

      console.log("  - Full clientMetadata being sent:", clientMetadata);

      // Store debug info in localStorage for persistence across redirects
      const debugInfo = {
        resourceMetadata: context.state.resourceMetadata,
        authServerMetadata: metadata,
        resourceScopes: context.state.resourceMetadata?.scopes_supported,
        authServerScopes: metadata.scopes_supported,
        finalScopes: scopesSupported,
        clientRegistrationScope: clientMetadata.scope,
        timestamp: new Date().toISOString()
      };
      
      showDebugInfo("Client Registration Debug", debugInfo);
      sessionStorage.setItem("mcp_inspector_debug_client_registration", JSON.stringify(debugInfo));

      console.log("🔍 Calling registerClient...");
      const fullInformation = await registerClient(context.serverUrl, {
        metadata,
        clientMetadata,
      });
      console.log("✅ Client registration completed:", fullInformation);

      context.provider.saveClientInformation(fullInformation);
      context.updateState({
        oauthClientInfo: fullInformation,
        oauthStep: "authorization_redirect",
      });
      console.log("✅ client_registration step completed, moving to authorization_redirect");
    },
  },

  authorization_redirect: {
    canTransition: async (context) =>
      !!context.state.oauthMetadata && !!context.state.oauthClientInfo,
    execute: async (context) => {
      console.log("🚀 Starting authorization_redirect step");
      
      const metadata = context.state.oauthMetadata!;
      const clientInformation = context.state.oauthClientInfo!;

      // Debug: Log what we're using for authorization
      console.log("🔍 Authorization Redirect Debug:");
      console.log("  - Auth server metadata:", metadata);
      console.log("  - Auth server scopes_supported:", metadata.scopes_supported);
      console.log("  - Resource metadata:", context.state.resourceMetadata);
      console.log("  - Resource scopes_supported:", context.state.resourceMetadata?.scopes_supported);

      let scope: string | undefined = undefined;
      const resourceScopes = context.state.resourceMetadata?.scopes_supported;
      if (resourceScopes) {
        scope = resourceScopes.join(" ");
        console.log("  - Authorization request scope (from resource):", scope);
      } else if (metadata.scopes_supported) {
        scope = metadata.scopes_supported.join(" ");
        console.log("  - Authorization request scope (from auth server):", scope);
      } else {
        console.log("  - ⚠️ No scopes found for authorization request!");
      }

      console.log("  - Resource being requested:", context.state.resource);

      // Store debug info in localStorage for persistence across redirects
      const debugInfo = {
        authServerMetadata: metadata,
        authServerScopes: metadata.scopes_supported,
        resourceMetadata: context.state.resourceMetadata,
        resourceScopes: resourceScopes,
        authorizationScope: scope,
        resource: context.state.resource,
        timestamp: new Date().toISOString()
      };
      
      showDebugInfo("Authorization Redirect Debug", debugInfo);
      sessionStorage.setItem("mcp_inspector_debug_authorization", JSON.stringify(debugInfo));

      console.log("🔍 Calling startAuthorization...");
      const { authorizationUrl, codeVerifier } = await startAuthorization(
        context.serverUrl,
        {
          metadata,
          clientInformation,
          redirectUrl: context.provider.redirectUrl,
          scope,
          resource: context.state.resource ?? undefined,
        },
      );

      console.log("  - Generated authorization URL:", authorizationUrl.toString());

      context.provider.saveCodeVerifier(codeVerifier);
      context.updateState({
        authorizationUrl: authorizationUrl.toString(),
        oauthStep: "authorization_code",
      });
      console.log("✅ authorization_redirect step completed, moving to authorization_code");
    },
  },

  authorization_code: {
    canTransition: async () => true,
    execute: async (context) => {
      if (
        !context.state.authorizationCode ||
        context.state.authorizationCode.trim() === ""
      ) {
        context.updateState({
          validationError: "You need to provide an authorization code",
        });
        // Don't advance if no code
        throw new Error("Authorization code required");
      }
      context.updateState({
        validationError: null,
        oauthStep: "token_request",
      });
    },
  },

  token_request: {
    canTransition: async (context) => {
      return (
        !!context.state.authorizationCode &&
        !!context.provider.getServerMetadata() &&
        !!(await context.provider.clientInformation())
      );
    },
    execute: async (context) => {
      const codeVerifier = context.provider.codeVerifier();
      const metadata = context.provider.getServerMetadata()!;
      const clientInformation = (await context.provider.clientInformation())!;

      const tokens = await exchangeAuthorization(context.serverUrl, {
        metadata,
        clientInformation,
        authorizationCode: context.state.authorizationCode,
        codeVerifier,
        redirectUri: context.provider.redirectUrl,
        resource: context.state.resource ?? undefined,
      });

      context.provider.saveTokens(tokens);
      context.updateState({
        oauthTokens: tokens,
        oauthStep: "complete",
      });
    },
  },

  complete: {
    canTransition: async () => false,
    execute: async () => {
      // No-op for complete state
    },
  },
};

export class OAuthStateMachine {
  constructor(
    private serverUrl: string,
    private updateState: (updates: Partial<AuthDebuggerState>) => void,
  ) {}

  // Helper function to display debug info from sessionStorage
  private displayStoredDebugInfo() {
    try {
      const clientRegDebug = sessionStorage.getItem("mcp_inspector_debug_client_registration");
      const authDebug = sessionStorage.getItem("mcp_inspector_debug_authorization");
      
      if (clientRegDebug) {
        console.log("📋 Previous Client Registration Debug (from sessionStorage):");
        console.log(JSON.parse(clientRegDebug));
      }
      
      if (authDebug) {
        console.log("📋 Previous Authorization Debug (from sessionStorage):");
        console.log(JSON.parse(authDebug));
      }
      
      // Clear the debug info after displaying it
      sessionStorage.removeItem("mcp_inspector_debug_client_registration");
      sessionStorage.removeItem("mcp_inspector_debug_authorization");
    } catch (error) {
      console.log("Error retrieving debug info:", error);
    }
  }

  async executeStep(state: AuthDebuggerState): Promise<void> {
    const provider = new DebugInspectorOAuthClientProvider(this.serverUrl);
    const context: StateMachineContext = {
      state,
      serverUrl: this.serverUrl,
      provider,
      updateState: this.updateState,
    };

    // Display any stored debug info at the start of each step
    this.displayStoredDebugInfo();

    const transition = oauthTransitions[state.oauthStep];
    if (!(await transition.canTransition(context))) {
      throw new Error(`Cannot transition from ${state.oauthStep}`);
    }

    await transition.execute(context);
  }
}
