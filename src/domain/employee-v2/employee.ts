import { EmployeeProfile, EmployeeProfilePatch, EmployeeProfileParams } from './employee-profile';
import { EmployeeAccount, EmployeeAccountPatch, EmployeeAccountParams } from './employee-account';
import { EmployeeContract, EmployeeContractParams } from './employee-contract';

export interface EmployeeParams {
  profile: EmployeeProfile | EmployeeProfileParams;
  account: EmployeeAccount | EmployeeAccountParams;
  contract: EmployeeContract | EmployeeContractParams;
}

export interface EmployeeDTO {
  profile: ReturnType<EmployeeProfile['toJSON']>;
  account: ReturnType<EmployeeAccount['toJSON']>;
  contract: ReturnType<EmployeeContract['toJSON']>;
}

export class Employee {
  readonly profile: EmployeeProfile;
  readonly account: EmployeeAccount;
  readonly contract: EmployeeContract;

  constructor(params: EmployeeParams) {
    if (!params || typeof params !== 'object') {
      throw new Error('Employee parameters are required');
    }

    this.profile = params.profile instanceof EmployeeProfile ? params.profile : new EmployeeProfile(params.profile);
    this.account = params.account instanceof EmployeeAccount ? params.account : new EmployeeAccount(params.account);
    this.contract =
      params.contract instanceof EmployeeContract ? params.contract : new EmployeeContract(params.contract);
  }

  get uuid(): string {
    return this.profile.uuid;
  }

  get username(): string {
    return this.account.username;
  }

  get fullName(): string {
    return this.profile.fullName;
  }

  updateProfile(patch: EmployeeProfilePatch): Employee {
    return new Employee({
      profile: this.profile.update(patch),
      account: this.account,
      contract: this.contract
    });
  }

  updateAccount(patch: EmployeeAccountPatch): Employee {
    return new Employee({
      profile: this.profile,
      account: this.account.update(patch),
      contract: this.contract
    });
  }

  updateContract(patch: Partial<EmployeeContractParams>): Employee {
    return new Employee({
      profile: this.profile,
      account: this.account,
      contract: this.contract.update(patch)
    });
  }

  changePosition(patch: Parameters<EmployeeContract['changePosition']>[0]): Employee {
    return new Employee({
      profile: this.profile,
      account: this.account,
      contract: this.contract.changePosition(patch)
    });
  }

  changeShift(patch: Parameters<EmployeeContract['changeShift']>[0]): Employee {
    return new Employee({
      profile: this.profile,
      account: this.account,
      contract: this.contract.changeShift(patch)
    });
  }

  updateLeave(patch: Parameters<EmployeeContract['updateLeave']>[0]): Employee {
    return new Employee({
      profile: this.profile,
      account: this.account,
      contract: this.contract.updateLeave(patch)
    });
  }

  toDTO(): EmployeeDTO {
    return {
      profile: this.profile.toJSON(),
      account: this.account.toJSON(),
      contract: this.contract.toJSON()
    };
  }

  toJSON(): EmployeeDTO {
    return this.toDTO();
  }
}
