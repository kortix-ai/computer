import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { commonTags, namespace, appName, awsRegion } from "./config";

interface IamArgs {
  oidcProviderUrl: pulumi.Output<string>;
  oidcProviderArn: pulumi.Output<string>;
}

function createIrsaRole(
  name: string,
  oidcProviderUrl: pulumi.Output<string>,
  oidcProviderArn: pulumi.Output<string>,
  serviceAccountNamespace: string,
  serviceAccountName: string,
) {
  const assumeRolePolicy = pulumi
    .all([oidcProviderUrl, oidcProviderArn])
    .apply(([url, arn]) => {
      // Strip https:// prefix for OIDC condition keys
      const oidcHost = url.replace(/^https?:\/\//, "");
      const oidcSub = `${oidcHost}:sub`;
      const oidcAud = `${oidcHost}:aud`;
      return JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Federated: arn },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                [oidcSub]: `system:serviceaccount:${serviceAccountNamespace}:${serviceAccountName}`,
                [oidcAud]: "sts.amazonaws.com",
              },
            },
          },
        ],
      });
    });

  return new aws.iam.Role(name, {
    assumeRolePolicy,
    tags: { ...commonTags, Name: name },
  });
}

export function createIamRoles(args: IamArgs) {
  const accountId = aws.getCallerIdentity().then((id) => id.accountId);

  // Pod role — SecretsManager read + CloudWatch Logs
  const podRole = createIrsaRole(
    "kortix-api-pod-role",
    args.oidcProviderUrl,
    args.oidcProviderArn,
    namespace,
    appName,
  );

  new aws.iam.RolePolicy("kortix-api-pod-policy", {
    role: podRole.id,
    policy: pulumi.output(accountId).apply((acctId) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "secretsmanager:GetSecretValue",
              "secretsmanager:DescribeSecret",
            ],
            Resource: `arn:aws:secretsmanager:${awsRegion}:${acctId}:secret:kortix/*`,
          },
          {
            Effect: "Allow",
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
            ],
            Resource: "*",
          },
        ],
      }),
    ),
  });

  // ALB Controller role
  const albControllerRole = createIrsaRole(
    "kortix-alb-controller-role",
    args.oidcProviderUrl,
    args.oidcProviderArn,
    "kube-system",
    "aws-load-balancer-controller",
  );

  new aws.iam.RolePolicy(
    "alb-controller-inline-policy",
    {
      role: albControllerRole.id,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "iam:CreateServiceLinkedRole",
              "ec2:DescribeAccountAttributes",
              "ec2:DescribeAddresses",
              "ec2:DescribeAvailabilityZones",
              "ec2:DescribeInternetGateways",
              "ec2:DescribeVpcs",
              "ec2:DescribeSubnets",
              "ec2:DescribeSecurityGroups",
              "ec2:DescribeInstances",
              "ec2:DescribeNetworkInterfaces",
              "ec2:DescribeTags",
              "ec2:DescribeCoipPools",
              "ec2:GetCoipPoolUsage",
              "ec2:DescribeVpcPeeringConnections",
              "elasticloadbalancing:*",
              "ec2:AuthorizeSecurityGroupIngress",
              "ec2:RevokeSecurityGroupIngress",
              "ec2:CreateSecurityGroup",
              "ec2:DeleteSecurityGroup",
              "ec2:CreateTags",
              "ec2:DeleteTags",
              "cognito-idp:DescribeUserPoolClient",
              "acm:ListCertificates",
              "acm:DescribeCertificate",
              "iam:ListServerCertificates",
              "iam:GetServerCertificate",
              "waf-regional:*",
              "wafv2:*",
              "shield:*",
              "tag:GetResources",
              "tag:TagResources",
            ],
            Resource: "*",
          },
        ],
      }),
    },
  );

  // ESO role — Secrets Manager access
  const esoRole = createIrsaRole(
    "kortix-eso-role",
    args.oidcProviderUrl,
    args.oidcProviderArn,
    "external-secrets",
    "external-secrets",
  );

  new aws.iam.RolePolicy("kortix-eso-policy", {
    role: esoRole.id,
    policy: pulumi.output(accountId).apply((acctId) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "secretsmanager:GetSecretValue",
              "secretsmanager:ListSecrets",
              "secretsmanager:DescribeSecret",
            ],
            Resource: `arn:aws:secretsmanager:${awsRegion}:${acctId}:secret:kortix/*`,
          },
        ],
      }),
    ),
  });

  return { podRole, albControllerRole, esoRole };
}
