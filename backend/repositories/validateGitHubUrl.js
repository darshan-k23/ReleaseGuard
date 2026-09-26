import { ApiError } from "../apiErrors.js";

/**
 * Validates and normalizes a GitHub repository URL.
 *
 * Supported format:
 *   https://github.com/owner/repository
 *
 * Rejects:
 *   - arbitrary filesystem paths
 *   - non-GitHub URLs
 *   - malformed URLs
 *   - private repository credentials in URL
 */
export function validateGitHubUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new ApiError(
      400,
      "INVALID_REPOSITORY_URL",
      "A repository URL is required.",
      "Provide a valid public GitHub repository URL in the format https://github.com/owner/repository.",
    );
  }

  const trimmed = rawUrl.trim();

  // Reject local and arbitrary filesystem paths
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    trimmed.startsWith(".") ||
    /^[A-Za-z]:[/\\]/.test(trimmed) ||
    trimmed.startsWith("file:")
  ) {
    throw new ApiError(
      400,
      "INVALID_REPOSITORY_URL",
      "Arbitrary filesystem paths are not allowed.",
      "Provide a valid public GitHub repository URL in the format https://github.com/owner/repository.",
    );
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ApiError(
      400,
      "INVALID_REPOSITORY_URL",
      "Malformed repository URL.",
      "The repository URL must be a valid URL string.",
    );
  }

  // Reject embedded credentials (private repositories with tokens or passwords)
  if (parsed.username || parsed.password) {
    throw new ApiError(
      400,
      "PRIVATE_REPOSITORIES_NOT_SUPPORTED",
      "Private repositories with credentials in the URL are not supported.",
      "ReleaseGuard currently only supports public GitHub repositories.",
    );
  }

  // Only HTTPS is permitted
  if (parsed.protocol !== "https:") {
    throw new ApiError(
      400,
      "INVALID_REPOSITORY_URL",
      "Only HTTPS repository URLs are supported.",
      "Provide a URL using the https:// protocol.",
    );
  }

  // Only github.com is permitted
  if (parsed.hostname.toLowerCase() !== "github.com") {
    throw new ApiError(
      400,
      "UNSUPPORTED_REPOSITORY_SOURCE",
      "Only GitHub repositories are supported.",
      "The repository URL must be hosted on https://github.com.",
    );
  }

  // Reject query parameters and hash fragments
  if (parsed.search || parsed.hash) {
    throw new ApiError(
      400,
      "INVALID_REPOSITORY_URL",
      "Malformed GitHub repository URL: query parameters and fragments are not allowed.",
      "Provide a clean GitHub repository URL in the format https://github.com/owner/repository.",
    );
  }

  // Ensure path consists of exactly /owner/repository
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new ApiError(
      400,
      "INVALID_REPOSITORY_URL",
      "Malformed GitHub repository URL.",
      "Expected format: https://github.com/owner/repository.",
    );
  }

  const [owner, rawRepo] = segments;
  const repo = rawRepo.endsWith(".git") ? rawRepo.slice(0, -4) : rawRepo;

  // GitHub user/org name: 1-39 alphanumeric or hyphen characters, no leading/trailing hyphen
  const ownerRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
  // GitHub repository name: 1-100 alphanumeric, hyphen, underscore, or period characters
  const repoRegex = /^[a-zA-Z0-9_.-]{1,100}$/;

  if (!ownerRegex.test(owner) || !repoRegex.test(repo) || repo === "." || repo === "..") {
    throw new ApiError(
      400,
      "INVALID_REPOSITORY_URL",
      "Malformed GitHub repository URL: invalid owner or repository name.",
      "Ensure the owner and repository names adhere to GitHub naming conventions.",
    );
  }

  const normalizedUrl = `https://github.com/${owner}/${repo}`;
  return {
    owner,
    repo,
    normalizedUrl,
  };
}
