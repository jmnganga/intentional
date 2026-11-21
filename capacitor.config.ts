import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.intentional.planner',
  appName: 'Intentional',
  webDir: 'out',
  android: {
    backgroundColor: '#111214',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_intentional',
    },
  },
}

export default config
