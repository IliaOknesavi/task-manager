import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hatiko.taskmanager',
  appName: 'Task Manager',
  webDir: 'public',
  server: {
    url: 'https://task-manager-production-1073.up.railway.app',
    cleartext: false,
  },
};

export default config;
