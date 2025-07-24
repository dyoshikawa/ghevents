import { graphql } from "@octokit/graphql";
import type { ProgressDisplay } from "../cli/ui/progress.js";
import type { GitHubEventUnion, ParsedCliOptions } from "../types/index.js";

export class GitHubService {
  private graphqlWithAuth: typeof graphql;

  constructor(token: string) {
    this.graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });
  }

  async fetchEvents(
    options: ParsedCliOptions,
    progress: ProgressDisplay,
  ): Promise<GitHubEventUnion[]> {
    progress.update("Fetching user information...");
    const user = await this.fetchUser();

    const events: GitHubEventUnion[] = [];

    progress.update("Fetching issues...");
    const issues = await this.fetchIssues(user.login, options);
    events.push(...issues);

    progress.update("Fetching issue comments...");
    const issueComments = await this.fetchIssueComments(user.login, options);
    events.push(...issueComments);

    progress.update("Fetching pull requests...");
    const pullRequests = await this.fetchPullRequests(user.login, options);
    events.push(...pullRequests);

    progress.update("Fetching pull request reviews...");
    const reviews = await this.fetchPullRequestReviews(user.login, options);
    events.push(...reviews);

    progress.update("Fetching commits...");
    const commits = await this.fetchCommits(user.login, options);
    events.push(...commits);

    // Sort events by date
    events.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return options.order === "asc" ? dateA - dateB : dateB - dateA;
    });

    return events;
  }

  private async fetchUser(): Promise<{ login: string; url: string }> {
    const query = `
      query {
        viewer {
          login
          url
        }
      }
    `;

    const response: any = await this.graphqlWithAuth(query);
    return response.viewer;
  }

  private async fetchIssues(
    username: string,
    options: ParsedCliOptions,
  ): Promise<GitHubEventUnion[]> {
    const query = `
      query($username: String!, $since: DateTime!, $until: DateTime!, $after: String) {
        search(
          query: "author:$username is:issue created:$since..$until"
          type: ISSUE
          first: 100
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on Issue {
              number
              title
              body
              url
              state
              createdAt
              labels(first: 10) {
                nodes {
                  name
                  color
                }
              }
              repository {
                name
                owner {
                  login
                }
                url
                visibility
              }
              author {
                login
                url
              }
            }
          }
        }
      }
    `;

    return this.fetchPaginatedData(
      query,
      {
        username,
        since: options.since.toISOString(),
        until: options.until.toISOString(),
      },
      options.visibility,
      (node: any) => ({
        type: "Issue" as const,
        number: node.number,
        title: node.title,
        body: node.body,
        url: node.url,
        state: node.state,
        createdAt: node.createdAt,
        labels: node.labels.nodes.map((label: any) => ({
          name: label.name,
          color: label.color,
        })),
        repository: {
          name: node.repository.name,
          owner: node.repository.owner.login,
          url: node.repository.url,
        },
        author: {
          login: node.author.login,
          url: node.author.url,
        },
      }),
    );
  }

  private async fetchIssueComments(
    username: string,
    options: ParsedCliOptions,
  ): Promise<GitHubEventUnion[]> {
    const query = `
      query($username: String!, $since: DateTime!, $until: DateTime!, $after: String) {
        search(
          query: "commenter:$username is:issue-comment created:$since..$until"
          type: ISSUE
          first: 100
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on Issue {
              comments(
                filterBy: { since: $since }
                first: 100
              ) {
                nodes {
                  body
                  url
                  createdAt
                  author {
                    login
                    url
                  }
                }
              }
              number
              title
              url
              repository {
                name
                owner {
                  login
                }
                url
                visibility
              }
            }
          }
        }
      }
    `;

    const results = await this.fetchPaginatedData(
      query,
      {
        username,
        since: options.since.toISOString(),
        until: options.until.toISOString(),
      },
      options.visibility,
      (node: any) => {
        return node.comments.nodes
          .filter((comment: any) => comment.author.login === username)
          .map((comment: any) => ({
            type: "IssueComment" as const,
            body: comment.body,
            url: comment.url,
            createdAt: comment.createdAt,
            issue: {
              number: node.number,
              title: node.title,
              url: node.url,
            },
            repository: {
              name: node.repository.name,
              owner: node.repository.owner.login,
              url: node.repository.url,
            },
            author: {
              login: comment.author.login,
              url: comment.author.url,
            },
          }));
      },
    );

    return results.flat();
  }

  private async fetchPullRequests(
    username: string,
    options: ParsedCliOptions,
  ): Promise<GitHubEventUnion[]> {
    const query = `
      query($username: String!, $since: DateTime!, $until: DateTime!, $after: String) {
        search(
          query: "author:$username is:pr created:$since..$until"
          type: ISSUE
          first: 100
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on PullRequest {
              number
              title
              body
              url
              state
              createdAt
              baseRefName
              headRefName
              changedFiles
              additions
              deletions
              repository {
                name
                owner {
                  login
                }
                url
                visibility
              }
              author {
                login
                url
              }
            }
          }
        }
      }
    `;

    return this.fetchPaginatedData(
      query,
      {
        username,
        since: options.since.toISOString(),
        until: options.until.toISOString(),
      },
      options.visibility,
      (node: any) => ({
        type: "PullRequest" as const,
        number: node.number,
        title: node.title,
        body: node.body,
        url: node.url,
        state: node.state,
        createdAt: node.createdAt,
        baseRef: node.baseRefName,
        headRef: node.headRefName,
        changedFiles: node.changedFiles,
        additions: node.additions,
        deletions: node.deletions,
        repository: {
          name: node.repository.name,
          owner: node.repository.owner.login,
          url: node.repository.url,
        },
        author: {
          login: node.author.login,
          url: node.author.url,
        },
      }),
    );
  }

  private async fetchPullRequestReviews(
    username: string,
    options: ParsedCliOptions,
  ): Promise<GitHubEventUnion[]> {
    const query = `
      query($username: String!, $since: DateTime!, $until: DateTime!, $after: String) {
        search(
          query: "reviewed-by:$username is:pr created:$since..$until"
          type: ISSUE
          first: 100
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on PullRequest {
              reviews(
                first: 100
                filterBy: { since: $since }
              ) {
                nodes {
                  state
                  body
                  url
                  createdAt
                  author {
                    login
                    url
                  }
                }
              }
              number
              title
              url
              repository {
                name
                owner {
                  login
                }
                url
                visibility
              }
            }
          }
        }
      }
    `;

    const results = await this.fetchPaginatedData(
      query,
      {
        username,
        since: options.since.toISOString(),
        until: options.until.toISOString(),
      },
      options.visibility,
      (node: any) => {
        return node.reviews.nodes
          .filter((review: any) => review.author.login === username)
          .map((review: any) => ({
            type: "PullRequestReview" as const,
            state: review.state,
            body: review.body,
            url: review.url,
            createdAt: review.createdAt,
            pullRequest: {
              number: node.number,
              title: node.title,
              url: node.url,
            },
            repository: {
              name: node.repository.name,
              owner: node.repository.owner.login,
              url: node.repository.url,
            },
            author: {
              login: review.author.login,
              url: review.author.url,
            },
          }));
      },
    );

    return results.flat();
  }

  private async fetchCommits(
    username: string,
    options: ParsedCliOptions,
  ): Promise<GitHubEventUnion[]> {
    const query = `
      query($username: String!, $since: DateTime!, $until: DateTime!, $after: String) {
        search(
          query: "author:$username is:commit author-date:$since..$until"
          type: COMMIT
          first: 100
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on Commit {
              oid
              message
              url
              additions
              deletions
              changedFiles
              committedDate
              repository {
                name
                owner {
                  login
                }
                url
                visibility
              }
              author {
                user {
                  login
                  url
                }
              }
            }
          }
        }
      }
    `;

    return this.fetchPaginatedData(
      query,
      {
        username,
        since: options.since.toISOString(),
        until: options.until.toISOString(),
      },
      options.visibility,
      (node: any) => ({
        type: "Commit" as const,
        sha: node.oid,
        message: node.message,
        url: node.url,
        additions: node.additions,
        deletions: node.deletions,
        changedFiles: node.changedFiles,
        createdAt: node.committedDate,
        repository: {
          name: node.repository.name,
          owner: node.repository.owner.login,
          url: node.repository.url,
        },
        author: {
          login: node.author.user?.login || username,
          url: node.author.user?.url || "",
        },
      }),
    );
  }

  private async fetchPaginatedData<T>(
    query: string,
    variables: Record<string, any>,
    visibility: "public" | "private" | "all",
    transformer: (node: any) => T | T[],
  ): Promise<T[]> {
    const results: T[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    while (hasNextPage) {
      const response: any = await this.graphqlWithAuth(query, {
        ...variables,
        after,
      });

      const search = response.search;
      hasNextPage = search.pageInfo.hasNextPage;
      after = search.pageInfo.endCursor;

      for (const node of search.nodes) {
        if (this.shouldIncludeByVisibility(node.repository?.visibility, visibility)) {
          const transformed = transformer(node);
          if (Array.isArray(transformed)) {
            results.push(...transformed);
          } else {
            results.push(transformed);
          }
        }
      }
    }

    return results;
  }

  private shouldIncludeByVisibility(repoVisibility: string, targetVisibility: string): boolean {
    if (targetVisibility === "all") return true;
    if (targetVisibility === "public") return repoVisibility === "PUBLIC";
    if (targetVisibility === "private") return repoVisibility === "PRIVATE";
    return false;
  }
}
