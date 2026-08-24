/** @type {import('next').NextConfig} */
const nextConfig = {
	webpack: (config, { dev }) => {
		// Stabilize dev server on this Windows setup where filesystem cache intermittently drops chunks.
		if (dev) {
			config.cache = false;
		}

		return config;
	},
};

export default nextConfig;
