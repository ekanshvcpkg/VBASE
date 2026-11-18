import { Config } from '@remotion/cli/config';

// WebGL in headless Chrome. Override per render with --gl=swangle on GPU-less Linux.
Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('jpeg');
