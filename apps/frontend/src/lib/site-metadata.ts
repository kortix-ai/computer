/**
 * Site metadata configuration - SIMPLE AND WORKING
 */

const baseUrl = process.env.KORTIX_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'https://www.kortix.com';

export const siteMetadata = {
  name: 'Kortix',
  title: 'Kortix: Your Autonomous AI Worker',
  description: 'Built for complex tasks, designed for everything. The ultimate AI assistant that handles it all—from simple requests to mega-complex projects.',
  url: baseUrl,
  keywords: 'Kortix, AI Worker, Agentic AI, Autonomous AI Worker, AI Automation, AI Workflow Automation, AI Assistant, Task Automation',
};
