## [1.0.2](https://github.com/nubiia-dev/mcp-borme/compare/v1.0.1...v1.0.2) (2026-10-22)


### Bug Fixes

* use the native fetch and drop node-fetch ([3030501](https://github.com/nubiia-dev/mcp-borme/commit/3030501c1d6b4a627915a54bada3fb5174805126))

## [1.0.1](https://github.com/nubiia-dev/mcp-borme/compare/v1.0.0...v1.0.1) (2026-10-22)


### Bug Fixes

* stop shipping compiled tests in the npm package ([2a51b60](https://github.com/nubiia-dev/mcp-borme/commit/2a51b6082dedf24d9e3b76c7fbfc46c4c80232d1))

# 1.0.0 (2026-10-22)


### Bug Fixes

* make server.json validation resilient to network failures ([1ad476a](https://github.com/nubiia-dev/mcp-borme/commit/1ad476a0f2d66f05df8699fd47a13cbe44b8619a))
* refuse redirects and ignore unset config placeholders ([86f1fe9](https://github.com/nubiia-dev/mcp-borme/commit/86f1fe958c52c902484344186f0787d4ccbc0692))
* report unmatched provinces in the daily summary and match by substring ([61cce76](https://github.com/nubiia-dev/mcp-borme/commit/61cce76f1eab0523e34794085f41e5777df16297))
* require 3 characters for partial province matches in the daily summary ([375ccac](https://github.com/nubiia-dev/mcp-borme/commit/375ccac2b9fb37dc4cf319bb3d026ac00d90046a))
* require legal article numbers to start with a digit ([92f6976](https://github.com/nubiia-dev/mcp-borme/commit/92f6976f0b9f5d008e26d5e28d40035296d6a75d))
* shorten server.json description and validate it in CI ([c55107f](https://github.com/nubiia-dev/mcp-borme/commit/c55107f2872ef7030fdc0b15fa828e5ef6b49326))
* unref the rate limiter cleanup timer so the process exits on stdin close ([b2060fc](https://github.com/nubiia-dev/mcp-borme/commit/b2060fc4e689fd490dbc2e385967d4297ece4af0))


### Features

* expose the response size cap in the extension settings ([ad1380c](https://github.com/nubiia-dev/mcp-borme/commit/ad1380c9dc45f6516956f97688b239a96b49e1f2))
* implement mcp-borme v1 ([58f97d6](https://github.com/nubiia-dev/mcp-borme/commit/58f97d61c57d09d40c883b4cdb5f08e9643852e0))
