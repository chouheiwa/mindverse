import { defineConfig } from 'vitest/config'
import { rendererVirtualModule } from './vite/rendererModule.js'

export default defineConfig({
  plugins: [rendererVirtualModule('three')],
  test: {
    exclude: ['e2e/**', '**/node_modules/**', '**/.git/**'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/starmap/gl/cinematic.ts',
        'src/starmap/gl/planetMaterials.ts',
        'src/starmap/focusEmphasis.ts',
        'src/starmap/labelVisibility.ts',
        'src/starmap/probeInspection.ts',
        'src/starmap/resourceScope.ts',
        'src/starmap/e2eDiagnostics.ts',
        'src/starmap/starIdentity.ts',
        'src/ui/explorationState.ts',
        'src/ui/ProbeInspectionPanel.tsx',
        'src/ui/RenderFallback.tsx',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
})
