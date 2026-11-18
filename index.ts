// Custom entry: background tasks MUST be defined at module scope before the app renders, because the
// OS can launch the JS runtime headlessly just to deliver locations (no UI tree is mounted then).
import './src/tracking/backgroundTasks';
import 'expo-router/entry';
