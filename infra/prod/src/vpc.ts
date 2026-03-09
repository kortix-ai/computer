import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import { clusterName, commonTags } from "./config";

export function createVpc() {
  const vpc = new awsx.ec2.Vpc("kortix-vpc", {
    cidrBlock: "10.0.0.0/16",
    numberOfAvailabilityZones: 3,
    natGateways: { strategy: awsx.ec2.NatGatewayStrategy.OnePerAz },
    subnetStrategy: awsx.ec2.SubnetAllocationStrategy.Auto,
    subnetSpecs: [
      {
        type: awsx.ec2.SubnetType.Public,
        name: "public",
        tags: {
          "kubernetes.io/role/elb": "1",
          [`kubernetes.io/cluster/${clusterName}`]: "shared",
        },
      },
      {
        type: awsx.ec2.SubnetType.Private,
        name: "private",
        tags: {
          "kubernetes.io/role/internal-elb": "1",
          [`kubernetes.io/cluster/${clusterName}`]: "shared",
        },
      },
    ],
    tags: { ...commonTags, Name: "kortix-vpc" },
  });

  const albSg = new aws.ec2.SecurityGroup("alb-sg", {
    vpcId: vpc.vpcId,
    description: "Security group for ALB - allows HTTPS inbound",
    ingress: [
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
        description: "HTTPS from internet",
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow all outbound",
      },
    ],
    tags: { ...commonTags, Name: "kortix-alb-sg" },
  });

  return { vpc, albSg, albSgId: albSg.id };
}
