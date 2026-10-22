# Privacy Policy

**Last Updated**: October 22, 2026

This Privacy Policy describes how the MCP BORME server ("the Server", "we", "our")
handles data when you use it to connect your AI assistant to the OpenMercantil API.

## 1. Overview

The MCP BORME server is an open-source Model Context Protocol (MCP) server that acts as a
bridge between AI assistants (like Claude) and the public OpenMercantil API
(`https://openmercantil.es`), which serves Spanish company information derived from the
BORME. This server runs locally on your machine and does not operate any cloud services or
remote servers that process your data.

## 2. Data Collection

### 2.1 What Data We Collect

The Server processes the following data:

- **OpenMercantil API Key (optional)**: if you choose to set one, provided via the
  `OPENMERCANTIL_API_KEY` environment variable
- **API Request Data**: the company names, CIFs, person names, slugs, dates and filters you
  or your AI assistant send through the Server
- **API Response Data**: company reports, bulletin summaries, legal texts and procurement
  notices returned by OpenMercantil

### 2.2 How Data is Collected

- The API key, if any, is read from your local environment variables when the Server starts
- Request and response data flows through the Server during runtime as you interact with
  your AI assistant
- No data is collected, transmitted, or stored by the Server beyond what is described in §4

## 3. Data Usage

### 3.1 How We Use Your Data

Your data is used exclusively for the following purposes:

- **API Authentication**: your API key, if set, selects your account quota
- **Request Proxying**: the Server forwards your queries to the appropriate OpenMercantil
  endpoints
- **Response Delivery**: API responses are returned to your AI assistant for processing and
  presentation

### 3.2 What We Don't Do With Your Data

The Server does NOT:

- Store your API key, queries or results
- Log API requests, responses, or your API key to disk
- Analyze, profile, or perform any secondary processing on your queries or the results
- Write any file to your machine

## 4. Data Storage and Retention

### 4.1 No Persistent Storage

The Server does not persist data. Request and response data is held in memory only for the
duration of a single API call and is discarded after the response is delivered.

### 4.2 Temporary Memory Usage

- Your API key, if set, is held in memory for the lifetime of the Server process
- A small in-memory counter per tool is kept for local rate limiting (tool name and
  timestamps only, no request content)
- The rate-limit headers of the latest response are kept in memory for diagnostics

## 5. Data Sharing and Third-Party Access

### 5.1 OpenMercantil API

Your queries (and your API key, if set) are transmitted to:

- **Service**: OpenMercantil API
- **Purpose**: to fulfil your requests for company, bulletin, sector, legal and procurement
  data
- **Endpoint**: `https://openmercantil.es/api/v1/...` (over HTTPS)
- **Terms**: https://openmercantil.es/terminos-de-uso

The API is operated by OpenMercantil and is subject to its own privacy policy and terms of
service. The API key is sent in the `X-API-Key` HTTPS header, not in the URL. Without a key,
requests are anonymous, although OpenMercantil may see your IP address for rate limiting.

### 5.2 No Other Third Parties

Your data is NOT shared with:

- The maintainers or contributors of this open-source project
- Any analytics services
- Any telemetry or error reporting services
- Any other third-party services or APIs

## 6. Your Responsibilities

As a user of this Server, you are responsible for:

- Keeping your OpenMercantil API key secure, if you use one
- Complying with OpenMercantil's terms of use and with the licences of the underlying public
  sources (BORME re-use conditions, Ley 37/2007; attribution is included in the responses)
- Complying with applicable data protection laws (e.g. GDPR) for any personal data you
  process through this Server. BORME records name natural persons (officers, attorneys,
  auditors): treat person searches and mentions as personal data and have a lawful basis for
  using them

## 7. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected in the
"Last Updated" date and, for material changes, noted in `CHANGELOG.md`.

## 8. Contact

For privacy-related questions, open an issue in this repository or contact
`hola@nubiia.es`.
