const BranchSharingInfoService = require('../../services/branchSharingInfo.service');
const BranchService = require('../../services/branch.service');
const UserService = require('../../services/user.service');
const NoteService = require('../../services/note.service');

const userService = new UserService();
const branchService = new BranchService();
const branchSharingInfoService = new BranchSharingInfoService();
const noteService = new NoteService();

exports.createBranch = async (req, res, next) => {
  const { user_id } = req.params;

  try {
    const newBranch = await branchService.createBranch(user_id);
    const user = await userService.getUserByMongooseId(user_id);

    user.my_branches.push(newBranch._id);

    const updatedUser
      = await userService
        .getUserByMongooseIdAndUpdate(user_id, user);

    res.status(201).json({
      result: 'ok',
      newBranch,
      updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

exports.getBranches = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit);
    const skip = parseInt(req.query.skip);
    const userId = req.params.user_id;
    const currentUser = await userService.getUserByMongooseId(userId);

    const myBranches = await Promise.all(
      currentUser.my_branches.map(branchId => {
        return branchService.getBranchByMongooseId(branchId);
      })
    );

    const sharedBranchInfos = await Promise.all(
      currentUser.shared_branches_info.map(branchSharingInfoId => {
        return branchSharingInfoService.getBranchSharingInfoByMongooseId(branchSharingInfoId);
      })
    );

    const sharedBranches = await Promise.all(
      sharedBranchInfos.map(sharedBranchInfo => {
        return branchService.getBranchByMongooseId(sharedBranchInfo.branch_id);
      })
    );

    const allBranches = [...myBranches, ...sharedBranches];
    const updatedAllBranches = await Promise.all(
      allBranches.map(async branch => {
        const latestNote = await noteService.getNoteByMongooseId(branch.latest_note);
        branch.latest_note = latestNote;
        return branch;
        // return {
        //   branch,
        //   latestNote,
        // }
      })
    );

    updatedAllBranches.sort((a, b) => {
      const left = a.latest_note.updated_at;
      const right = b.latest_note.updated_at;
      if (left < right) return 1;
      else if (left === right) return 0;
      else return -1;
    });

    if (skip > updatedAllBranches.length - 1) {
      return res.status(200).json({
        result: 'no more branches',
        message: '마지막 노트 입니다.'
      });
    }

    const limitedList = [...updatedAllBranches].splice(`${skip}`, `${limit + skip}`);

    const listWithEmail = await Promise.all(
      limitedList.map(async branch => {
        const user = await userService.getUserByMongooseId(branch.latest_note.created_by);

        return {
          email: user.email,
          branch
        };
      })
    );

    res.status(200).json({
      result: 'ok',
      data: listWithEmail
    });
  } catch (err) {
    next(err);
  }
};

exports.getPrivateBranches = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit);
    const skip = parseInt(req.query.skip);
    const userId = req.params.user_id;
    const currentUser = await userService.getUserByMongooseId(userId);

    const myBranches = await Promise.all(
      currentUser.my_branches.map(branchId => {
        return branchService.getBranchByMongooseId(branchId);
      })
    );

    const unSharedBranches = await Promise.all(
      myBranches.filter(branch => (!branch.shared_users_info.length))
    );

    const latestNoteInfo = await Promise.all(
      unSharedBranches.map(async branch => {
        const latestNote = await noteService.getNoteByMongooseId(branch.latest_note);
        branch.latest_note = latestNote;
        return branch;
      })
    );

    latestNoteInfo.sort((a, b) => {
      const left = a.latest_note.updated_at;
      const right = b.latest_note.updated_at;
      if (left < right) return 1;
      else if (left === right) return 0;
      else return -1;
    });

    const limitedList = [...latestNoteInfo].splice(`${skip}`, `${limit + skip}`);

    const listWithEmail = await Promise.all(
      limitedList.map(async branch => {
        const user = await userService.getUserByMongooseId(branch.latest_note.created_by);

        return {
          email: user.email,
          branch
        };
      })
    );

    res.status(200).json({
      result: 'ok',
      data: listWithEmail
    });
  } catch (err) {
    next(err);
  }

};

exports.getBranch = async (req, res, next) => {
  const { branch_id } = req.params;

  try {
    const branch
      = await branchService.getBranchByMongooseId(branch_id);

    if (!branch) {
      res.status(400).json({
        result: 'failure',
        message: '브랜치가 없습니다',
      });
    }

    res.status(200).json({
      result: 'ok',
      branch,
    });
  } catch (err) {
    next(err);
  }
};

exports.createBranchSharingInfo = async (req, res, next) => {
  try {
    const branchId = req.params.branch_id;
    const permission = req.body.sharingInfo.permission;
    const email = req.body.sharingInfo.email;
    const hasPermission = (permission === 'write');

    const sharedUser = await userService.getUserByEmail(email);
    const currentBranch = await branchService.getBranchByMongooseId(branchId);

    const isAuthor = await branchSharingInfoService.validateAuthor(currentBranch, email);

    if (isAuthor) {
      return res.json({
        result: 'validation err',
        message: '작성자에게 공유할 수 없습니다.'
      });
    }

    const hasAlreadyShared = await branchSharingInfoService.validateDuplication(currentBranch, email);

    if (hasAlreadyShared) {
      return res.json({
        result: 'validation err',
        message: '이미 공유된 유저입니다.'
      });
    }

    const branchSharingInfo = await branchSharingInfoService.createBranchSharingInfo(
      sharedUser._id, branchId, hasPermission
    );

    currentBranch.shared_users_info.push(branchSharingInfo._id);
    await branchService.getBranchByMongooseIdAndUpdate(branchId, currentBranch);

    sharedUser.shared_branches_info.push(branchSharingInfo._id);
    await userService.getUserByMongooseIdAndUpdate(sharedUser._id, sharedUser);

    return res.json({
      result: 'ok',
    });
  } catch (err) {
    next(err);
  }
};
