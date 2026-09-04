/** @type {import('next').NextConfig} */
const nextConfig = {
	webpack: (config, { dev }) => {
		// Stabilize dev server on this Windows setup where filesystem cache intermittently drops chunks.
		if (dev) {
			config.cache = false;
		}

		return config;
	},
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					// Prevents this app from being framed by another origin (clickjacking).
					{ key: "X-Frame-Options", value: "DENY" },
					// Stops browsers from MIME-sniffing responses away from their declared Content-Type.
					{ key: "X-Content-Type-Options", value: "nosniff" },
					// Don't leak full URLs (which can carry IDs/paths) to third-party origins on outbound links.
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
					// Disable browser features this app never uses.
					{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
					// Force HTTPS for a year, including subdomains, once a browser has seen it once.
					{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
				],
			},
		];
	},
};

export default nextConfig;
