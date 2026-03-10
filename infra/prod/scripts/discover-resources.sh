#!/bin/zsh
# Discovers existing AWS/K8s resources and generates a Pulumi bulk import JSON file
# Usage: zsh scripts/discover-resources.sh > import.json

set -euo pipefail

REGION="us-west-2"
CLUSTER="kortix-prod"
ACCOUNT="935064898258"

echo "=== Discovering AWS resources ===" >&2

# --- VPC ---
VPC_ID=$(aws ec2 describe-vpcs --region $REGION \
  --filters "Name=cidr-block,Values=10.0.0.0/16" \
  --query 'Vpcs[0].VpcId' --output text)
echo "VPC: $VPC_ID" >&2

# Internet Gateway
IGW_ID=$(aws ec2 describe-internet-gateways --region $REGION \
  --filters "Name=attachment.vpc-id,Values=$VPC_ID" \
  --query 'InternetGateways[0].InternetGatewayId' --output text)
echo "IGW: $IGW_ID" >&2

# Public subnets (sorted by AZ)
PUBLIC_SUBNET_IDS=($(aws ec2 describe-subnets --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:kubernetes.io/role/elb,Values=1" \
  --query 'sort_by(Subnets, &AvailabilityZone)[*].SubnetId' --output text))
echo "Public subnets: ${PUBLIC_SUBNET_IDS[*]}" >&2

# Private subnets (sorted by AZ)
PRIVATE_SUBNET_IDS=($(aws ec2 describe-subnets --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:kubernetes.io/role/internal-elb,Values=1" \
  --query 'sort_by(Subnets, &AvailabilityZone)[*].SubnetId' --output text))
echo "Private subnets: ${PRIVATE_SUBNET_IDS[*]}" >&2

# NAT Gateways (sorted by subnet/AZ)
NAT_GW_IDS=($(aws ec2 describe-nat-gateways --region $REGION \
  --filter "Name=vpc-id,Values=$VPC_ID" "Name=state,Values=available" \
  --query 'sort_by(NatGateways, &SubnetId)[*].NatGatewayId' --output text))
echo "NAT Gateways: ${NAT_GW_IDS[*]}" >&2

# EIPs for NAT Gateways
EIP_IDS=($(aws ec2 describe-nat-gateways --region $REGION \
  --filter "Name=vpc-id,Values=$VPC_ID" "Name=state,Values=available" \
  --query 'sort_by(NatGateways, &SubnetId)[*].NatGatewayAddresses[0].AllocationId' --output text))
echo "EIPs: ${EIP_IDS[*]}" >&2

# Route tables - public (has IGW route, not main) - one per subnet
PUBLIC_RT_IDS=($(aws ec2 describe-route-tables --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=route.gateway-id,Values=$IGW_ID" \
  --query 'sort_by(RouteTables[?Associations[0].Main!=`true`], &RouteTableId)[*].RouteTableId' --output text))
echo "Public RTs: ${PUBLIC_RT_IDS[*]}" >&2

# Route tables - private (has NAT GW routes)
PRIVATE_RT_IDS=($(aws ec2 describe-route-tables --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "sort_by(RouteTables[?Routes[?NatGatewayId!=null]], &RouteTableId)[*].RouteTableId" --output text))
echo "Private RTs: ${PRIVATE_RT_IDS[*]}" >&2

# Route table associations - public (one per public RT)
PUBLIC_RTA_IDS=()
for rt in "${PUBLIC_RT_IDS[@]}"; do
  rta=$(aws ec2 describe-route-tables --region $REGION \
    --filters "Name=route-table-id,Values=$rt" \
    --query 'RouteTables[0].Associations[?!Main].RouteTableAssociationId | [0]' --output text)
  PUBLIC_RTA_IDS+=("$rta")
done
echo "Public RTAs: ${PUBLIC_RTA_IDS[*]}" >&2

# Route table associations - private (one per private RT)
PRIVATE_RTA_IDS=()
for rt in "${PRIVATE_RT_IDS[@]}"; do
  rta=$(aws ec2 describe-route-tables --region $REGION \
    --filters "Name=route-table-id,Values=$rt" \
    --query 'RouteTables[0].Associations[?!Main].RouteTableAssociationId | [0]' --output text)
  PRIVATE_RTA_IDS+=("$rta")
done
echo "Private RTAs: ${PRIVATE_RTA_IDS[*]}" >&2

# ALB Security Group
ALB_SG_ID=$(aws ec2 describe-security-groups --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=kortix-alb-sg" \
  --query 'SecurityGroups[0].GroupId' --output text)
echo "ALB SG: $ALB_SG_ID" >&2

# --- EKS ---
EKS_SG=$(aws eks describe-cluster --name $CLUSTER --region $REGION \
  --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' --output text)

# Cluster role
CLUSTER_ROLE_NAME=$(aws eks describe-cluster --name $CLUSTER --region $REGION \
  --query 'cluster.roleArn' --output text | awk -F'/' '{print $NF}')
echo "Cluster Role: $CLUSTER_ROLE_NAME" >&2

# SG Rule for ALB->pods 8008
ALB_SG_RULE=$(aws ec2 describe-security-group-rules --region $REGION \
  --filters "Name=group-id,Values=$EKS_SG" \
  --query "SecurityGroupRules[?FromPort==\`8008\` && ToPort==\`8008\`].SecurityGroupRuleId | [0]" --output text)
echo "ALB->Pods SG Rule: $ALB_SG_RULE" >&2

# OIDC Provider
OIDC_ISSUER=$(aws eks describe-cluster --name $CLUSTER --region $REGION \
  --query 'cluster.identity.oidc.issuer' --output text)
OIDC_ID=$(echo "$OIDC_ISSUER" | awk -F'/' '{print $NF}')
OIDC_ARN="arn:aws:iam::${ACCOUNT}:oidc-provider/oidc.eks.${REGION}.amazonaws.com/id/${OIDC_ID}"
echo "OIDC Provider ARN: $OIDC_ARN" >&2

# Worker role
WORKER_ROLE_NAME=$(aws iam list-roles \
  --query "Roles[?contains(RoleName, 'kortix-worker-role')].RoleName | [0]" --output text)
echo "Worker Role: $WORKER_ROLE_NAME" >&2

# IAM Roles
POD_ROLE_NAME=$(aws iam list-roles \
  --query "Roles[?contains(RoleName, 'kortix-api-pod-role')].RoleName | [0]" --output text)
echo "Pod Role: $POD_ROLE_NAME" >&2

ALB_ROLE_NAME=$(aws iam list-roles \
  --query "Roles[?contains(RoleName, 'kortix-alb-controller-role')].RoleName | [0]" --output text)
echo "ALB Controller Role: $ALB_ROLE_NAME" >&2

ESO_ROLE_NAME=$(aws iam list-roles \
  --query "Roles[?contains(RoleName, 'kortix-eso-role')].RoleName | [0]" --output text)
echo "ESO Role: $ESO_ROLE_NAME" >&2

# ECR
ECR_REPO="kortix/kortix-api"

# Secrets Manager
SECRET_ARN=$(aws secretsmanager describe-secret --secret-id kortix/prod/api-config --region $REGION \
  --query 'ARN' --output text)
echo "Secret ARN: $SECRET_ARN" >&2

# --- Generate bulk import JSON ---
cat <<EOF
{
  "resources": [
    {"type": "aws:ec2/vpc:Vpc", "name": "kortix-vpc", "id": "$VPC_ID"},
    {"type": "aws:ec2/internetGateway:InternetGateway", "name": "kortix-igw", "id": "$IGW_ID"},

    {"type": "aws:ec2/subnet:Subnet", "name": "kortix-public-0", "id": "${PUBLIC_SUBNET_IDS[1]}"},
    {"type": "aws:ec2/subnet:Subnet", "name": "kortix-public-1", "id": "${PUBLIC_SUBNET_IDS[2]}"},
    {"type": "aws:ec2/subnet:Subnet", "name": "kortix-public-2", "id": "${PUBLIC_SUBNET_IDS[3]}"},

    {"type": "aws:ec2/subnet:Subnet", "name": "kortix-private-0", "id": "${PRIVATE_SUBNET_IDS[1]}"},
    {"type": "aws:ec2/subnet:Subnet", "name": "kortix-private-1", "id": "${PRIVATE_SUBNET_IDS[2]}"},
    {"type": "aws:ec2/subnet:Subnet", "name": "kortix-private-2", "id": "${PRIVATE_SUBNET_IDS[3]}"},

    {"type": "aws:ec2/routeTable:RouteTable", "name": "kortix-public-rt-0", "id": "${PUBLIC_RT_IDS[1]}"},
    {"type": "aws:ec2/routeTable:RouteTable", "name": "kortix-public-rt-1", "id": "${PUBLIC_RT_IDS[2]}"},
    {"type": "aws:ec2/routeTable:RouteTable", "name": "kortix-public-rt-2", "id": "${PUBLIC_RT_IDS[3]}"},

    {"type": "aws:ec2/route:Route", "name": "kortix-public-route-0", "id": "${PUBLIC_RT_IDS[1]}_0.0.0.0/0"},
    {"type": "aws:ec2/route:Route", "name": "kortix-public-route-1", "id": "${PUBLIC_RT_IDS[2]}_0.0.0.0/0"},
    {"type": "aws:ec2/route:Route", "name": "kortix-public-route-2", "id": "${PUBLIC_RT_IDS[3]}_0.0.0.0/0"},

    {"type": "aws:ec2/routeTableAssociation:RouteTableAssociation", "name": "kortix-public-rta-0", "id": "${PUBLIC_RTA_IDS[1]}"},
    {"type": "aws:ec2/routeTableAssociation:RouteTableAssociation", "name": "kortix-public-rta-1", "id": "${PUBLIC_RTA_IDS[2]}"},
    {"type": "aws:ec2/routeTableAssociation:RouteTableAssociation", "name": "kortix-public-rta-2", "id": "${PUBLIC_RTA_IDS[3]}"},

    {"type": "aws:ec2/eip:Eip", "name": "kortix-nat-eip-0", "id": "${EIP_IDS[1]}"},
    {"type": "aws:ec2/eip:Eip", "name": "kortix-nat-eip-1", "id": "${EIP_IDS[2]}"},
    {"type": "aws:ec2/eip:Eip", "name": "kortix-nat-eip-2", "id": "${EIP_IDS[3]}"},

    {"type": "aws:ec2/natGateway:NatGateway", "name": "kortix-nat-0", "id": "${NAT_GW_IDS[1]}"},
    {"type": "aws:ec2/natGateway:NatGateway", "name": "kortix-nat-1", "id": "${NAT_GW_IDS[2]}"},
    {"type": "aws:ec2/natGateway:NatGateway", "name": "kortix-nat-2", "id": "${NAT_GW_IDS[3]}"},

    {"type": "aws:ec2/routeTable:RouteTable", "name": "kortix-private-rt-0", "id": "${PRIVATE_RT_IDS[1]}"},
    {"type": "aws:ec2/routeTable:RouteTable", "name": "kortix-private-rt-1", "id": "${PRIVATE_RT_IDS[2]}"},
    {"type": "aws:ec2/routeTable:RouteTable", "name": "kortix-private-rt-2", "id": "${PRIVATE_RT_IDS[3]}"},

    {"type": "aws:ec2/route:Route", "name": "kortix-private-route-0", "id": "${PRIVATE_RT_IDS[1]}_0.0.0.0/0"},
    {"type": "aws:ec2/route:Route", "name": "kortix-private-route-1", "id": "${PRIVATE_RT_IDS[2]}_0.0.0.0/0"},
    {"type": "aws:ec2/route:Route", "name": "kortix-private-route-2", "id": "${PRIVATE_RT_IDS[3]}_0.0.0.0/0"},

    {"type": "aws:ec2/routeTableAssociation:RouteTableAssociation", "name": "kortix-private-rta-0", "id": "${PRIVATE_RTA_IDS[1]}"},
    {"type": "aws:ec2/routeTableAssociation:RouteTableAssociation", "name": "kortix-private-rta-1", "id": "${PRIVATE_RTA_IDS[2]}"},
    {"type": "aws:ec2/routeTableAssociation:RouteTableAssociation", "name": "kortix-private-rta-2", "id": "${PRIVATE_RTA_IDS[3]}"},

    {"type": "aws:ec2/securityGroup:SecurityGroup", "name": "alb-sg", "id": "$ALB_SG_ID"},

    {"type": "aws:iam/role:Role", "name": "kortix-cluster-role", "id": "$CLUSTER_ROLE_NAME"},
    {"type": "aws:iam/rolePolicyAttachment:RolePolicyAttachment", "name": "kortix-cluster-policy-0", "id": "${CLUSTER_ROLE_NAME}/arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"},
    {"type": "aws:iam/rolePolicyAttachment:RolePolicyAttachment", "name": "kortix-cluster-policy-1", "id": "${CLUSTER_ROLE_NAME}/arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"},

    {"type": "aws:iam/role:Role", "name": "kortix-worker-role", "id": "$WORKER_ROLE_NAME"},
    {"type": "aws:iam/rolePolicyAttachment:RolePolicyAttachment", "name": "kortix-worker-policy-0", "id": "${WORKER_ROLE_NAME}/arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"},
    {"type": "aws:iam/rolePolicyAttachment:RolePolicyAttachment", "name": "kortix-worker-policy-1", "id": "${WORKER_ROLE_NAME}/arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"},
    {"type": "aws:iam/rolePolicyAttachment:RolePolicyAttachment", "name": "kortix-worker-policy-2", "id": "${WORKER_ROLE_NAME}/arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"},
    {"type": "aws:iam/rolePolicyAttachment:RolePolicyAttachment", "name": "kortix-worker-policy-3", "id": "${WORKER_ROLE_NAME}/arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"},

    {"type": "aws:eks/cluster:Cluster", "name": "kortix-eks", "id": "$CLUSTER"},
    {"type": "aws:iam/openIdConnectProvider:OpenIdConnectProvider", "name": "kortix-oidc", "id": "$OIDC_ARN"},
    {"type": "aws:eks/nodeGroup:NodeGroup", "name": "kortix-workers", "id": "${CLUSTER}:kortix-workers"},

    {"type": "aws:ec2/securityGroupRule:SecurityGroupRule", "name": "alb-to-pods-8008", "id": "$ALB_SG_RULE"},

    {"type": "aws:iam/role:Role", "name": "kortix-api-pod-role", "id": "$POD_ROLE_NAME"},
    {"type": "aws:iam/rolePolicy:RolePolicy", "name": "kortix-api-pod-policy", "id": "${POD_ROLE_NAME}:kortix-api-pod-policy"},
    {"type": "aws:iam/role:Role", "name": "kortix-alb-controller-role", "id": "$ALB_ROLE_NAME"},
    {"type": "aws:iam/rolePolicy:RolePolicy", "name": "alb-controller-inline-policy", "id": "${ALB_ROLE_NAME}:alb-controller-inline-policy"},
    {"type": "aws:iam/role:Role", "name": "kortix-eso-role", "id": "$ESO_ROLE_NAME"},
    {"type": "aws:iam/rolePolicy:RolePolicy", "name": "kortix-eso-policy", "id": "${ESO_ROLE_NAME}:kortix-eso-policy"},

    {"type": "aws:ecr/repository:Repository", "name": "kortix-api", "id": "$ECR_REPO"},
    {"type": "aws:ecr/lifecyclePolicy:LifecyclePolicy", "name": "kortix-api-lifecycle", "id": "$ECR_REPO"},

    {"type": "aws:secretsmanager/secret:Secret", "name": "kortix-api-config", "id": "$SECRET_ARN"},

    {"type": "aws:eks/addon:Addon", "name": "cloudwatch-observability", "id": "${CLUSTER}:amazon-cloudwatch-observability"}
  ]
}
EOF

echo "" >&2
echo "=== Done! Now run: ===" >&2
echo "pulumi import --file import.json --generate-code=false --protect=false" >&2
