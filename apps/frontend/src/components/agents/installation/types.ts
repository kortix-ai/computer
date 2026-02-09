/**
 * Minimal types kept for json-import-dialog and custom-server-step.
 * The rest of the installation types were removed with the legacy agents page.
 */

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  type: 'credential_profile' | 'composio_profile' | 'custom_server';
  service_name: string;
  qualified_name: string;
  custom_type?: string;
  required_config?: string[];
  app_slug?: string;
  app_name?: string;
}
