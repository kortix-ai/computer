#!/bin/zsh
# Tears down all existing infrastructure so Pulumi can recreate from scratch
# DESTRUCTIVE - only run on test/staging environments

set -uo pipefail

REGION="us-west-2"
CLUSTER="kortix-prod"
VPC_ID="vpc-066ded2480cb2b70b"

echo "⚠️  This will DELETE all infrastructure in $REGION for cluster $CLUSTER"
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

# --- Delete EKS resources ---
echo ">>> Deleting EKS node group..."
aws eks delete-nodegroup --cluster-name $CLUSTER --nodegroup-name kortix-workers --region $REGION 2>/dev/null || true
echo "Waiting for node group deletion (this takes a few minutes)..."
aws eks wait nodegroup-deleted --cluster-name $CLUSTER --nodegroup-name kortix-workers --region $REGION 2>/dev/null || true

echo ">>> Deleting EKS addon..."
aws eks delete-addon --cluster-name $CLUSTER --addon-name amazon-cloudwatch-observability --region $REGION 2>/dev/null || true

echo ">>> Deleting EKS cluster..."
aws eks delete-cluster --name $CLUSTER --region $REGION 2>/dev/null || true
echo "Waiting for cluster deletion (this takes ~10 minutes)..."
aws eks wait cluster-deleted --name $CLUSTER --region $REGION 2>/dev/null || true

# --- Delete OIDC Provider ---
echo ">>> Deleting OIDC providers..."
for arn in $(aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[*].Arn' --output text); do
  if echo "$arn" | grep -q "eks.*$REGION"; then
    echo "  Deleting $arn"
    aws iam delete-open-id-connect-provider --open-id-connect-provider-arn "$arn" 2>/dev/null || true
  fi
done

# --- Delete IAM roles ---
delete_role() {
  local role_name=$1
  echo ">>> Deleting role: $role_name"
  # Detach managed policies
  for policy_arn in $(aws iam list-attached-role-policies --role-name "$role_name" --query 'AttachedPolicies[*].PolicyArn' --output text 2>/dev/null); do
    aws iam detach-role-policy --role-name "$role_name" --policy-arn "$policy_arn" 2>/dev/null || true
  done
  # Delete inline policies
  for policy_name in $(aws iam list-role-policies --role-name "$role_name" --query 'PolicyNames[*]' --output text 2>/dev/null); do
    aws iam delete-role-policy --role-name "$role_name" --policy-name "$policy_name" 2>/dev/null || true
  done
  # Delete instance profiles
  for profile in $(aws iam list-instance-profiles-for-role --role-name "$role_name" --query 'InstanceProfiles[*].InstanceProfileName' --output text 2>/dev/null); do
    aws iam remove-role-from-instance-profile --instance-profile-name "$profile" --role-name "$role_name" 2>/dev/null || true
    aws iam delete-instance-profile --instance-profile-name "$profile" 2>/dev/null || true
  done
  aws iam delete-role --role-name "$role_name" 2>/dev/null || true
}

# Find and delete all kortix-related roles
for role in $(aws iam list-roles --query "Roles[?contains(RoleName, 'kortix')].RoleName" --output text); do
  delete_role "$role"
done

# --- Delete VPC resources ---
echo ">>> Deleting NAT Gateways..."
for nat_id in $(aws ec2 describe-nat-gateways --region $REGION \
  --filter "Name=vpc-id,Values=$VPC_ID" "Name=state,Values=available" \
  --query 'NatGateways[*].NatGatewayId' --output text); do
  echo "  Deleting $nat_id"
  aws ec2 delete-nat-gateway --nat-gateway-id "$nat_id" --region $REGION 2>/dev/null || true
done
echo "Waiting for NAT gateways to delete..."
sleep 30

# Release EIPs
echo ">>> Releasing Elastic IPs..."
for alloc_id in $(aws ec2 describe-addresses --region $REGION \
  --filters "Name=tag:Project,Values=kortix" \
  --query 'Addresses[*].AllocationId' --output text); do
  echo "  Releasing $alloc_id"
  aws ec2 release-address --allocation-id "$alloc_id" --region $REGION 2>/dev/null || true
done

# Delete security groups (non-default)
echo ">>> Deleting security groups..."
for sg_id in $(aws ec2 describe-security-groups --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[?GroupName!=`default`].GroupId' --output text); do
  echo "  Deleting $sg_id"
  # First remove all ingress/egress rules
  aws ec2 revoke-security-group-ingress --group-id "$sg_id" --region $REGION \
    --security-group-rule-ids $(aws ec2 describe-security-group-rules --region $REGION \
    --filters "Name=group-id,Values=$sg_id" --query 'SecurityGroupRules[?!IsEgress].SecurityGroupRuleId' --output text) 2>/dev/null || true
  aws ec2 revoke-security-group-egress --group-id "$sg_id" --region $REGION \
    --security-group-rule-ids $(aws ec2 describe-security-group-rules --region $REGION \
    --filters "Name=group-id,Values=$sg_id" --query 'SecurityGroupRules[?IsEgress].SecurityGroupRuleId' --output text) 2>/dev/null || true
  aws ec2 delete-security-group --group-id "$sg_id" --region $REGION 2>/dev/null || true
done

# Delete subnets
echo ">>> Deleting subnets..."
for subnet_id in $(aws ec2 describe-subnets --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[*].SubnetId' --output text); do
  echo "  Deleting $subnet_id"
  aws ec2 delete-subnet --subnet-id "$subnet_id" --region $REGION 2>/dev/null || true
done

# Delete route tables (non-main)
echo ">>> Deleting route tables..."
for rt_id in $(aws ec2 describe-route-tables --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'RouteTables[?Associations[0].Main!=`true`].RouteTableId' --output text); do
  # Delete associations first
  for assoc_id in $(aws ec2 describe-route-tables --region $REGION \
    --filters "Name=route-table-id,Values=$rt_id" \
    --query 'RouteTables[0].Associations[?!Main].RouteTableAssociationId' --output text); do
    aws ec2 disassociate-route-table --association-id "$assoc_id" --region $REGION 2>/dev/null || true
  done
  echo "  Deleting $rt_id"
  aws ec2 delete-route-table --route-table-id "$rt_id" --region $REGION 2>/dev/null || true
done

# Detach and delete IGW
echo ">>> Deleting Internet Gateway..."
for igw_id in $(aws ec2 describe-internet-gateways --region $REGION \
  --filters "Name=attachment.vpc-id,Values=$VPC_ID" \
  --query 'InternetGateways[*].InternetGatewayId' --output text); do
  aws ec2 detach-internet-gateway --internet-gateway-id "$igw_id" --vpc-id $VPC_ID --region $REGION 2>/dev/null || true
  aws ec2 delete-internet-gateway --internet-gateway-id "$igw_id" --region $REGION 2>/dev/null || true
done

# Delete VPC
echo ">>> Deleting VPC..."
aws ec2 delete-vpc --vpc-id $VPC_ID --region $REGION 2>/dev/null || true

# --- Delete ECR ---
echo ">>> Deleting ECR repository..."
aws ecr delete-repository --repository-name kortix/kortix-api --region $REGION --force 2>/dev/null || true

# --- Delete Secrets Manager secret ---
echo ">>> Deleting Secrets Manager secret..."
aws secretsmanager delete-secret --secret-id kortix/prod/api-config --region $REGION --force-delete-without-recovery 2>/dev/null || true

echo ""
echo "=== Teardown complete ==="
echo "Now run:"
echo "  1. pulumi stack rm prod --force && pulumi stack init prod"
echo "  2. pulumi config set aws:region us-west-2"
echo "  3. Set all config values"
echo "  4. pulumi up"
echo "  5. Restore secrets: aws secretsmanager put-secret-value --secret-id kortix/prod/api-config --region us-west-2 --secret-string file:///tmp/secrets-backup.json"
