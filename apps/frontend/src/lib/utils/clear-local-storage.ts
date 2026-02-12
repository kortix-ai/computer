export const clearUserLocalStorage = () => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem('customModels');
    localStorage.removeItem('model-selection-v3');
    localStorage.removeItem('agent-selection-storage');
    localStorage.removeItem('auth-tracking-storage');
    localStorage.removeItem('pendingAgentPrompt');
    // Clean up legacy keys
    localStorage.removeItem('suna-model-selection-v2');
    localStorage.removeItem('suna_upgrade_dialog_displayed');
    localStorage.removeItem('opencode-model-store-v1');
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('maintenance-dismissed-')) {
        localStorage.removeItem(key);
      }
    });
    
    console.log('✅ Local storage cleared on logout');
  } catch (error) {
    console.error('❌ Error clearing local storage:', error);
  }
}; 