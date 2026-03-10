import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { clusterName, commonTags } from "./config";

export function createVpc() {
  const azs = aws.getAvailabilityZones({ state: "available" }).then((z) =>
    z.names.slice(0, 3),
  );

  const vpc = new aws.ec2.Vpc("kortix-vpc", {
    cidrBlock: "10.0.0.0/16",
    enableDnsSupport: true,
    enableDnsHostnames: true,
    tags: { ...commonTags, Name: "kortix-vpc" },
  });

  // Internet Gateway
  const igw = new aws.ec2.InternetGateway("kortix-igw", {
    vpcId: vpc.id,
    tags: { ...commonTags, Name: "kortix-igw" },
  });

  // Public subnets (one per AZ)
  const publicSubnets: aws.ec2.Subnet[] = [];
  for (let i = 0; i < 3; i++) {
    publicSubnets.push(
      new aws.ec2.Subnet(`kortix-public-${i}`, {
        vpcId: vpc.id,
        cidrBlock: `10.0.${i}.0/24`,
        availabilityZone: pulumi.output(azs).apply((a) => a[i]),
        mapPublicIpOnLaunch: true,
        tags: {
          ...commonTags,
          Name: `kortix-public-${i}`,
          "kubernetes.io/role/elb": "1",
          [`kubernetes.io/cluster/${clusterName}`]: "shared",
        },
      }),
    );
  }

  // Private subnets (one per AZ)
  const privateSubnets: aws.ec2.Subnet[] = [];
  for (let i = 0; i < 3; i++) {
    privateSubnets.push(
      new aws.ec2.Subnet(`kortix-private-${i}`, {
        vpcId: vpc.id,
        cidrBlock: `10.0.${i + 100}.0/24`,
        availabilityZone: pulumi.output(azs).apply((a) => a[i]),
        tags: {
          ...commonTags,
          Name: `kortix-private-${i}`,
          "kubernetes.io/role/internal-elb": "1",
          [`kubernetes.io/cluster/${clusterName}`]: "shared",
        },
      }),
    );
  }

  // Public route tables (one per AZ, matching existing infra)
  for (let i = 0; i < 3; i++) {
    const publicRt = new aws.ec2.RouteTable(`kortix-public-rt-${i}`, {
      vpcId: vpc.id,
      tags: { ...commonTags, Name: `kortix-public-rt-${i}` },
    });

    new aws.ec2.Route(`kortix-public-route-${i}`, {
      routeTableId: publicRt.id,
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: igw.id,
    });

    new aws.ec2.RouteTableAssociation(`kortix-public-rta-${i}`, {
      subnetId: publicSubnets[i].id,
      routeTableId: publicRt.id,
    });
  }

  // NAT Gateways (one per AZ) + Elastic IPs
  const natGateways: aws.ec2.NatGateway[] = [];
  for (let i = 0; i < 3; i++) {
    const eip = new aws.ec2.Eip(`kortix-nat-eip-${i}`, {
      domain: "vpc",
      tags: { ...commonTags, Name: `kortix-nat-eip-${i}` },
    });

    natGateways.push(
      new aws.ec2.NatGateway(`kortix-nat-${i}`, {
        subnetId: publicSubnets[i].id,
        allocationId: eip.id,
        tags: { ...commonTags, Name: `kortix-nat-${i}` },
      }),
    );
  }

  // Private route tables (one per AZ, each pointing to its NAT GW)
  for (let i = 0; i < 3; i++) {
    const privateRt = new aws.ec2.RouteTable(`kortix-private-rt-${i}`, {
      vpcId: vpc.id,
      tags: { ...commonTags, Name: `kortix-private-rt-${i}` },
    });

    new aws.ec2.Route(`kortix-private-route-${i}`, {
      routeTableId: privateRt.id,
      destinationCidrBlock: "0.0.0.0/0",
      natGatewayId: natGateways[i].id,
    });

    new aws.ec2.RouteTableAssociation(`kortix-private-rta-${i}`, {
      subnetId: privateSubnets[i].id,
      routeTableId: privateRt.id,
    });
  }

  // ALB Security Group
  const albSg = new aws.ec2.SecurityGroup("alb-sg", {
    vpcId: vpc.id,
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

  const publicSubnetIds = pulumi.output(publicSubnets.map((s) => s.id));
  const privateSubnetIds = pulumi.output(privateSubnets.map((s) => s.id));

  return {
    vpc,
    vpcId: vpc.id,
    publicSubnetIds,
    privateSubnetIds,
    albSg,
    albSgId: albSg.id,
  };
}
