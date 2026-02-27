import { useQuery, useMutation } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

export interface DetectUrlResult {
  url: string;
  source: 'ngrok' | 'config' | 'none';
  detected: boolean;
}

export interface GenerateManifestResult {
  manifest: Record<string, unknown>;
}

export function useDetectPublicUrl() {
  return useQuery({
    queryKey: ['slack-wizard', 'detect-url'],
    queryFn: async () => {
      const res = await backendApi.get<DetectUrlResult>(
        '/channels/slack-wizard/detect-url',
        { showErrors: false },
      );
      if (!res.success || !res.data) {
        throw new Error('Failed to detect public URL');
      }
      return res.data;
    },
    staleTime: 0,
    retry: false,
  });
}

export function useGenerateManifest() {
  return useMutation({
    mutationFn: async ({ publicUrl, botName }: { publicUrl: string; botName?: string }) => {
      const res = await backendApi.post<GenerateManifestResult>(
        '/channels/slack-wizard/generate-manifest',
        { publicUrl, botName },
      );
      if (!res.success || !res.data) {
        throw new Error('Failed to generate manifest');
      }
      return res.data;
    },
  });
}
