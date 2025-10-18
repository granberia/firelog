#!/usr/bin/env node

import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import simpleGit from 'simple-git';

const DRAFTS_DIR = '_drafts';
const POSTS_DIR = '_posts';
const TABS_DIR = '_tabs';
const CDN_IMG_DIR = path.join('cdn', 'img');
const URL_IMG_PREFIX = '/img';
const CONFIG_PATH = 'config.json';
const git = simpleGit();

async function gitConfig() {
  await git.addConfig('user.name', 'granberia');
  await git.addConfig('user.email', 'reptilesax@gmail.com');
}

function slugify(title) {
  return title
    .trim()
    .replace(/\s+/g, '-') // 공백 → -
    .replace(/-+/g, '-'); // 중복 - 제거
}

function getFormattedDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFullDateTime() {
  const date = new Date();
  const offset = -date.getTimezoneOffset();
  const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(
    2,
    '0'
  );
  const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, '0');
  const sign = offset >= 0 ? '+' : '-';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${sign}${offsetHours}${offsetMinutes}`;
}

async function createDraft() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (error) {
    console.error(
      `❌ 설정 파일(${CONFIG_PATH})을 읽을 수 없습니다. 파일이 존재하고 JSON 형식이 올바른지 확인하세요.`
    );
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: '📝 포스트 제목을 입력하세요:',
      validate: (input) => (input ? true : '제목은 비워둘 수 없습니다.')
    },
    {
      type: 'checkbox',
      name: 'categories',
      message: '📂 카테고리를 선택하세요 (스페이스바로 선택, 엔터로 확정):',
      choices: config.categories,
      validate: (input) =>
        input.length > 0 ? true : '하나 이상의 카테고리를 선택해야 합니다.'
    },
    {
      type: 'checkbox',
      name: 'tags',
      message: '🏷️ 태그를 선택하세요 (스페이스바로 선택, 엔터로 확정):',
      choices: config.tags
    }
  ]);

  const { title, categories, tags } = answers;

  const date = getFormattedDate();
  const slug = slugify(title);
  const draftDirName = `${date}-${slug}`;
  const draftDirPath = path.join(DRAFTS_DIR, draftDirName);
  const fileName = `${draftDirName}.md`;
  const filePath = path.join(draftDirPath, fileName);

  const fileContent = `---
title: ${title}
date: ${getFullDateTime()}
categories: [${categories.join(', ')}]
tags: [${tags.join(', ')}]
---

`;

  if (!fs.existsSync(draftDirPath)) {
    fs.mkdirSync(draftDirPath, { recursive: true });
    console.log(`📁 초안 폴더를 생성했습니다: ${draftDirPath}`);
  }

  fs.writeFileSync(filePath, fileContent);
  console.log(`✅ 초안 파일이 성공적으로 생성되었습니다: ${filePath}`);
}

async function publishDraft() {
  if (!fs.existsSync(DRAFTS_DIR)) {
    console.log(
      '🤷 초안 폴더가 없습니다. 먼저 draft 명령어로 글을 생성하세요.'
    );
    return;
  }

  // 이제 파일이 아닌 폴더를 기준으로 초안 목록을 가져옵니다.
  const draftDirs = fs
    .readdirSync(DRAFTS_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  if (draftDirs.length === 0) {
    console.log('🤷 발행할 초안이 없습니다.');
    return;
  }

  const { dirToPublish } = await inquirer.prompt([
    {
      type: 'list',
      name: 'dirToPublish',
      message: '🚀 발행할 초안 폴더를 선택하세요:',
      choices: draftDirs
    }
  ]);

  const sourceDraftDir = path.join(DRAFTS_DIR, dirToPublish); // 예: _drafts/2023-10-27-slug
  const mdFileName = `${dirToPublish}.md`;
  const sourceMdPath = path.join(sourceDraftDir, mdFileName);

  // 목적지 경로 설정
  const destMdPath = path.join(POSTS_DIR, mdFileName);
  const destCdnDir = path.join(CDN_IMG_DIR, dirToPublish);

  // 1. 초안 폴더 내 파일 목록 읽기 (이미지 등)
  const allFiles = fs.readdirSync(sourceDraftDir);
  const assetFiles = allFiles.filter((file) => file !== mdFileName);

  // 2. 마크다운 파일 내용 읽기 및 경로 변환
  if (!fs.existsSync(sourceMdPath)) {
    console.error(
      `❌ 오류: 마크다운 파일(${sourceMdPath})을 찾을 수 없습니다.`
    );
    return;
  }
  const originalContent = fs.readFileSync(sourceMdPath, 'utf-8');

  // 정규식: 상대 경로 이미지 링크 (![...](./...))를 찾아서 변경
  const imagePathRegex = /!\[(.*?)\]\(\s*(\.\/|\.\.\/)?(.*?)\s*\)/g;
  const newCdnPathPrefix = `${URL_IMG_PREFIX}/${dirToPublish}`;

  const newContent = originalContent.replace(
    imagePathRegex,
    `![$1](${newCdnPathPrefix}/$3)`
  );

  // 3. 목적지 폴더 생성
  if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR);
  if (assetFiles.length > 0 && !fs.existsSync(destCdnDir)) {
    fs.mkdirSync(destCdnDir, { recursive: true });
  }

  // 4. 경로가 수정된 마크다운 파일을 _posts로 쓰기
  fs.writeFileSync(destMdPath, newContent);
  console.log(`✅ 마크다운 파일 발행 완료: ${destMdPath}`);

  // 5. 이미지 파일들을 cdn/img 폴더로 이동
  for (const asset of assetFiles) {
    const sourceAssetPath = path.join(sourceDraftDir, asset);
    const destAssetPath = path.join(destCdnDir, asset);
    fs.renameSync(sourceAssetPath, destAssetPath);
  }
  if (assetFiles.length > 0) {
    console.log(`🖼️  이미지 파일들을 이동했습니다: ${destCdnDir}`);
  }

  // 6. 작업이 완료된 원본 초안 폴더 삭제
  fs.rmSync(sourceDraftDir, { recursive: true, force: true });
  console.log(`🗑️  원본 초안 폴더를 삭제했습니다: ${sourceDraftDir}`);

  // 7. Git 작업
  try {
    console.log('📦 Git에 변경사항을 커밋하고 푸시합니다...');
    gitConfig();

    await git.add(destMdPath); // 수정된 마크다운 파일 추가
    if (assetFiles.length > 0) {
      await git.add(destCdnDir); // 이미지 폴더 추가
    }

    await git.commit(`feat: publish new post - ${dirToPublish}`);
    await git.push();

    console.log('🎉 포스트 발행이 성공적으로 완료되었습니다!');
  } catch (error) {
    console.error(
      '❌ Git 작업 중 오류가 발생했습니다. Git이 설치되어 있고, 저장소 설정이 올바른지 확인하세요.'
    );
    console.error(error.message);
  }
}

async function updateTabs() {
  if (!fs.existsSync(TABS_DIR)) {
    console.log(
      `🤷 '${TABS_DIR}' 폴더가 존재하지 않습니다. 작업을 진행할 수 없습니다.`
    );
    return;
  }

  try {
    console.log(`📦 '${TABS_DIR}' 폴더의 변경사항을 배포합니다...`);
    gitConfig();

    console.log(`  -> git add ${TABS_DIR}`);
    await git.add(TABS_DIR);

    console.log('  -> git commit -m "chore: deploy tabs"');
    await git.commit('chore: deploy tabs');

    console.log('  -> git push');
    await git.push();

    console.log(`🎉 '${TABS_DIR}' 폴더 배포가 성공적으로 완료되었습니다!`);
  } catch (error) {
    if (error.stdout.toString().includes('nothing to commit')) {
      console.log('🤷 커밋할 변경사항이 없습니다. 작업을 종료합니다.');
    } else {
      console.error(
        '❌ Git 작업 중 오류가 발생했습니다. Git 상태를 확인해주세요.'
      );
      console.error(error.message);
    }
  }
}

async function main() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '👋 안녕하세요! 무엇을 도와드릴까요?',
      choices: [
        { name: '새로운 초안 작성하기', value: 'draft' },
        { name: '초안을 포스트로 발행하기', value: 'publish' },
        { name: '전체 탭을 배포하기', value: 'update' },
        { name: '종료', value: 'exit' }
      ]
    }
  ]);

  switch (action) {
    case 'draft':
      await createDraft();
      break;
    case 'publish':
      await publishDraft();
      break;
    case 'update':
      await updateTabs();
      break;
    case 'exit':
      console.log('👋 다음에 또 만나요!');
      break;
  }
}

main();
