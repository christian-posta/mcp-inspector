import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PendingElicitationRequest,
  ElicitationResponse,
} from "./ElicitationTab";

export type UrlElicitationRequestProps = {
  request: PendingElicitationRequest;
  onResolve: (id: number, response: ElicitationResponse) => void;
};

const UrlElicitationRequest = ({
  request,
  onResolve,
}: UrlElicitationRequestProps) => {
  const [isUrlOpened, setIsUrlOpened] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // For demo purposes, we'll use basic URL validation
  const validateUrl = (url: string): boolean => {
    try {
      const parsedUrl = new URL(url);
      // Only allow HTTPS for security (demo-friendly but still secure)
      return parsedUrl.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleOpenUrl = () => {
    const url = request.request.url;
    
    if (!url || !validateUrl(url)) {
      alert("Invalid URL: Only HTTPS URLs are allowed");
      return;
    }

    // Open URL in new tab
    window.open(url, "_blank", "noopener,noreferrer");
    setIsUrlOpened(true);
  };

  const handleAccept = () => {
    onResolve(request.id, { action: "accept" });
    setIsCompleted(true);
  };

  const handleDecline = () => {
    onResolve(request.id, { action: "decline" });
  };

  const handleCancel = () => {
    onResolve(request.id, { action: "cancel" });
  };

  // Extract URL domain for display
  const getDomain = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return "Invalid URL";
    }
  };

  const domain = request.request.url ? getDomain(request.request.url) : "No URL provided";

  return (
    <div
      data-testid="url-elicitation-request"
      className="flex gap-4 p-4 border rounded-lg space-y-4"
    >
      <div className="flex-1 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 p-2 rounded">
        <div className="space-y-2">
          <h4 className="font-semibold">URL Elicitation Request</h4>
          <p className="text-sm">{request.request.message}</p>
          
          {request.request.url && (
            <div className="mt-2">
              <h5 className="text-xs font-medium mb-1">Target URL:</h5>
              <div className="text-sm font-mono bg-gray-100 dark:bg-gray-700 p-2 rounded break-all">
                {request.request.url}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Domain: <strong>{domain}</strong>
              </p>
            </div>
          )}

          <div className="mt-2">
            <h5 className="text-xs font-medium mb-1">Elicitation ID:</h5>
            <div className="text-xs font-mono bg-gray-100 dark:bg-gray-700 p-1 rounded">
              {request.request.elicitationId}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <h4 className="font-medium">Actions</h4>
          
          {!isUrlOpened && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-sm text-blue-600 dark:text-blue-400">
                Click "Open URL" to navigate to the external site. After completing the interaction there, 
                return here and click "Accept" to confirm completion.
              </p>
            </div>
          )}

          {isUrlOpened && !isCompleted && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                ✅ URL opened in new tab. Complete the interaction on the external site, then return here and click "Accept".
              </p>
            </div>
          )}

          {isCompleted && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
              <p className="text-sm text-green-600 dark:text-green-400">
                ✅ Elicitation completed successfully!
              </p>
            </div>
          )}

          <div className="flex flex-col space-y-2">
            {!isUrlOpened && (
              <Button type="button" onClick={handleOpenUrl} className="w-full">
                Open URL in New Tab
              </Button>
            )}
            
            {isUrlOpened && !isCompleted && (
              <Button type="button" onClick={handleAccept} className="w-full">
                Accept (Completed)
              </Button>
            )}
            
            <div className="flex space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleDecline}
                disabled={isCompleted}
              >
                Decline
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCancel}
                disabled={isCompleted}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UrlElicitationRequest;
