const getEnvironment = () => {
  return process.env.NEXT_PUBLIC_ENV_MODE;
};

export const isLocal = () => {
  return getEnvironment() === 'local';
};

export const isCloud = () => {
  return getEnvironment() === 'cloud';
};
