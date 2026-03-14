import { getEnv } from '@/lib/env-config';

const getEnvironment = () => {
  return getEnv().ENV_MODE;
};

export const isLocal = () => {
  return getEnvironment() === 'local';
};

export const isCloud = () => {
  return getEnvironment() === 'cloud';
};
