const { User, Study, LikeStudy, Notice, JoinStudy } = require('../models');
const crypto = require('crypto'); // 비밀번호 암호화
const axios = require("axios");
const { getUserMap } = require('../utils/getUserMap');
const { getStudyImageUrl } = require('../utils/getImageUrl');
const { getStudyMap } = require('../utils/getStudyMap');
require('dotenv').config();

// 회원가입
exports.signupPostMid = async (req, res) => {
    try {
        const { nickname, password, email, birthday, job } = req.body;

        // 닉네임 사용자가 존재하는지 확인
        const checkNickname = await User.findOne({
            where: {
            nickname,
            },
        });

        if(checkNickname){
            return res.status(409).json({ error: '이미 존재하는 닉네임입니다.' });
        }

        const checkEmail = await User.findOne({
            where: {
            email,
            },
        });

        if(checkEmail){
            return res.status(409).json({ error: '이미 존재하는 이메일입니다.' });
        }

        // 비밀번호 해싱에 사용할 salt 생성
        const salt = crypto.randomBytes(16).toString('hex');

        // 사용자 비밀번호와 salt를 합쳐 해싱
        const hashedPassword = await crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('base64');

        // 회원가입
        const user = await User.create({
            nickname,
            password: hashedPassword,
            email,
            salt,
            birthday,
            job
        })

        return res.status(200).json({ message: '사용자 정보가 성공적으로 저장되었습니다.' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '서버 오류로 사용자 정보가 성공적으로 저장되지 않았습니다.' });
    }
};

// 로그인
exports.loginPostMid = async (req, res) => {
    try {
        const { nickname, password } = req.body;

        // 사용자 확인
        const user = await User.findOne({
            where: {
            nickname,
            },
        });

        // 사용자가 존재하지 않으면 오류 응답
        if (!user) {
            return res.status(400).json({ error: '존재하지 않는 사용자입니다.' });
        }

        if (typeof user.salt !== 'string' || typeof user.password !== 'string') {
            return res.status(500).json({ error: '서버 설정 오류: 잘못된 사용자 정보', 'user.salt': user });
        }

        // 입력된 비밀번호와 저장된 salt를 사용하여 해싱
        const hashedPassword = crypto.pbkdf2Sync(password, user.salt, 10000, 64, 'sha512').toString('base64');
        
        // 해싱된 비밀번호 비교
        if (hashedPassword !== user.password) {
            return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
        }

        return res.status(200).json({ message: '로그인 성공', id : user.id });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '서버 오류로 로그인이 성공적으로 이루어지지 않았습니다.' });
    }
};

// 카카오 OAuth 로그인
exports.kakaoLogin = async (req, res) => {
    const REST_API_KEY = process.env.KAKAO_REST_API_KEY;
    const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI;
    const code = req.body.code;
    
    try {
        const tokenResponse = await axios.post("https://kauth.kakao.com/oauth/token", null, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        params: {
            grant_type: "authorization_code",
            client_id: REST_API_KEY,
            redirect_uri: REDIRECT_URI,
            code: code,
        },
        });

        let accessToken = tokenResponse.data.access_token;
        const userData = await userInfo(accessToken);

        if (userData) {
        const kakao_id = userData.id;
        const { nickname, profile_image: profile_img_url } = userData.properties;

        // 회원이 있는지 확인
        const user = await User.findOne({ where: { kakao_id } });

        if (user) {
            console.log("카카오 로그인 성공", user.dataValues);
            res.status(200).json({ message: "카카오 로그인 성공", user });
        } else {
            const newUser = await User.create({ kakao_id, nickname, profile_img_url });
            console.log("카카오 로그인 성공", newUser.dataValues);
            res.status(200).json({ message: "카카오 로그인 성공", user: newUser });
        }

        } else {
        res.status(500).json({ error: "카카오 사용자 정보를 가져오는데 실패했습니다." });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "서버 오류로 카카오 로그인 실패" });
    }
}

// 카카오 사용자 정보
const userInfo = async (accessToken) => {
    try {
        const userResponse = await axios.get("https://kapi.kakao.com/v2/user/me", {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-type': 'application/x-www-form-urlencoded;charset=utf-8'
        },
        });
        if (userResponse.status === 200) {
        return userResponse.data;
        } else {
        console.log("사용자 정보를 가져오는데 실패했습니다: ", userResponse.status);
        return null;
        }
    } catch(err) {
        console.log(err);
        return null;
    }
}

// 모든 유저 조회
exports.allUser = async (req, res) => {
    try {
        const user = await User.findAll();
        res.json(user);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "서버 오류로 모든 유저 정보 조회 실패" });
    }
}
  
// 특정 유저 정보 조회
exports.userInfoGetMind = async (req, res) => {
    try {
        const user_id = req.params.user_id;

        const user = await getUserMap([user_id]);
        
        if (!user) {
        res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
        }

        let response = {
        id: user[user_id].id,
        nickname: user[user_id].nickname,
        profile_img_url: user[user_id].profile_img_url
        };

        res.json(response);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "서버 오류로 사용자 정보 조회 실패" })
    }
}

// 내가 작성한 스터디 조회
exports.userStudy = async (req, res) => {
    try {
        const user_id = Number(req.params.user_id);

        const study = await Study.findAll({
            where: { user_id: user_id }
        })

        if (!study) {
            return res.status(404).json({ error: "스터디를 찾을 수 없습니다." });
        }

        const studyIds = study.map(study => study.id);
        const studyMap = await getStudyMap(studyIds);

        const response = study.map(study => {
            return {
                study: studyMap[study.id]
            };
        });

        res.json(response);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "서버 오류로 내가 작성한 스터디 조회 실패" });
    }
}

// 내가 찜한 스터디 조회
exports.userLikeStudy = async (req, res) => {
    try {
        const user_id = Number(req.params.user_id);

        // 사용자가 좋아요를 누른 스터디 ID 목록 조회
        const likedStudies = await LikeStudy.findAll({
            where: { user_id: user_id }
        });

        if (likedStudies.length === 0) {
            return res.status(200).json(null);
        }

        const studyIds = likedStudies.map(like => like.study_id);

        // 좋아요를 누른 스터디들의 세부 정보 조회
        const studies = await Study.findAll({
            where: { id: studyIds }
        });

        // 각 스터디의 작성자 정보와 조회 횟수 및 좋아요 여부 조회
        const response = await Promise.all(studies.map(async (study) => {
            const studyMap = await getStudyMap([study.id]);
            
            return {
                study: studyMap[study.id],
                liked: true
            };
        }));

        res.status(200).json(response);

    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "서버 오류로 찜한 스터디 조회 실패" });
    }
}

// 내가 가입한 스터디 조회
exports.userJoinStudy = async (req, res) => {
    try {
        const user_id = Number(req.params.user_id);

        if (!user_id) {
            return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
        }

        const joinedStudy = await JoinStudy.findAll({
            where: { user_id: user_id }
        });

        if (joinedStudy.length === 0) {
            return res.status(200).json(null);
        }

        const studyIds = joinedStudy.map(join => join.study_id);

        const studies = await Study.findAll({
            where: { id: studyIds }
        });

        const userIds = studies.map(study => study.user_id);
        const userMap = await getUserMap(userIds);
        const studyMap = await getStudyMap(studyIds);

        const response = joinedStudy.map(join => {
            // const study = studies.find(study => study.id === join.study_id);
            const study = studyMap[join.study_id];
            const imageUrl = study.image ? getStudyImageUrl(study.image) : null;
            
            return {
                ...join.dataValues,
                study: {
                    ...study.dataValues,
                    image: imageUrl,
                    user: userMap[study.user_id]
                }
            };
        });

        res.status(200).json(response);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "서버 오류로 가입한 스터디 조회 실패" });
    }
}

// 내가 쓴 공지 조회
exports.userNotice = async (req, res) => {
    try {
        const user_id = Number(req.params.user_id);

        const notices = await Notice.findAll({
            where: { user_id: user_id }
        })

        if(notices.length === 0) {
            return res.status(200).json(null);
        }

        const user = await User.findByPk(user_id);
        if (!user) {
            return res.status(404).json({ error: '존재하지 않는 유저입니다.' });
        }

        const userIds = notices.map(notice => notice.user_id);
        const userMap = await getUserMap(userIds);

        const response = notices.map(notice => ({
            ...notice.dataValues,
            user: userMap[notice.user_id]
        }))

        res.status(200).json(response);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "서버 오류로 내가 쓴 공지 조회 실패" });
    }
}

// 유저가 완료한 과제 조회
exports.getCompletedTasksByUser = async (req, res) => {
    try {
        const user_id = req.params.user_id;

        // 유저 존재 여부
        const user = await User.findByPk(user_id);
        if (!user) {
            return res.status(404).json({ error: '존재하지 않는 유저입니다.' });
        }

        // 유저가 완료한 과제 조회
        const completedTasks = await Task.findAll({
            where: {
                user_id,
                completed: true
            },
            order: [['updatedAt', 'DESC']]
        });

        res.status(200).json(completedTasks);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류로 과제 조회 실패' });
    }
};