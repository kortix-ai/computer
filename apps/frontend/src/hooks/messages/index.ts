// Tool tracking - shared by KortixComputer and session system
export { getOrAssignToolNumber, getToolNumber, clearToolTracking } from './tool-tracking';

// Smooth text/streaming animation hooks - re-exported from shared package
export { 
  useSmoothText, 
  useSmoothToolField, 
  useSmoothAnimation, 
  type SmoothAnimationConfig,
  type SmoothToolConfig,
} from '@agentpress/shared/animations';
